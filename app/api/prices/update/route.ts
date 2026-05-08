// app/api/prices/update/route.ts
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';
import { categorizePricingCard } from '@/lib/utils/categorize-pricing-card';
import { lookupByCode } from '@/lib/api/tcg-catalog';
import { toTCGdexLang } from '@/lib/api/tcgdex';
import { tcgdexCardId } from '@/lib/api/tcgdex-set-mapping';
import { lookupCardmarketPricing } from '@/lib/api/cardmarket-pricing';
import { computeStockValue } from '@/lib/utils/stock-value';
import { apiError, unauthorizedResponse, notFoundResponse } from '@/lib/utils/api-response';
import type { Card, CardLanguage } from '@/lib/types';

export const runtime = 'nodejs';

const BATCH_SIZE = 200;
const PARALLELISM = 10;
const TCGDEX_BASE = 'https://api.tcgdex.net/v2';
// Aggressive 5s timeout — single-card refresh is user-facing, can't block
// the UI for 15s on a TCGdex hiccup. The Cardmarket-dump path is the
// primary; TCGdex is just a best-effort fallback.
const TCGDEX_TIMEOUT_MS = 5_000;

interface UpdateSummary {
  ok: boolean;
  total: number;
  updated: number;
  backfilled: number;
  skipped: number;
  /** how many of `updated` came from local Cardmarket dumps vs TCGdex live */
  source_cardmarket: number;
  source_tcgdex: number;
  /** count of dump matches where >1 product shared the same prefix in the
   *  expansion (we picked one by variant heuristic — flag for review) */
  ambiguous: number;
  errors: Array<{ card_id: string; message: string }>;
}

interface ResolvedPricing {
  source: 'cardmarket' | 'tcgdex';
  idProduct: number | null;
  low: number | null;
  trend: number | null;
  avg: number | null;
  ambiguous: boolean;
  /** Canonical CM URL, derived from card_index.url_path when available. */
  url: string | null;
}

const CARDMARKET_BASE_URL = 'https://www.cardmarket.com';

interface TCGdexCardmarket {
  idProduct?: number;
  low?: number;
  trend?: number;
  avg?: number;
}

interface TCGdexCardResponse {
  pricing?: { cardmarket?: TCGdexCardmarket | null };
}

function unauthorized(): NextResponse {
  return unauthorizedResponse();
}

async function handleRequest(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const cardId = url.searchParams.get('card_id');
  if (cardId) return handleSingleCard(cardId);

  const auth = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!auth || !secret || auth !== `Bearer ${secret}`) return unauthorized();

  return handleBulk();
}

// Vercel cron daemon issues GET (User-Agent: vercel-cron/1.0).
// The single-card refresh from the UI uses POST. Share the same logic.
export const GET = handleRequest;
export const POST = handleRequest;

async function handleBulk(): Promise<NextResponse> {
  const service = createServiceClient();
  const summary: UpdateSummary = {
    ok: true, total: 0, updated: 0, backfilled: 0, skipped: 0,
    source_cardmarket: 0, source_tcgdex: 0, ambiguous: 0, errors: [],
  };

  const { data: rows, error } = await service
    .from('cards')
    .select('*')
    .eq('status', 'for_sale')
    .order('cm_updated_at', { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE);

  if (error) {
    return apiError('read_failed', { status: 500, message: error.message });
  }

  const cards = (rows ?? []) as Card[];
  summary.total = cards.length;
  if (cards.length === 0) return NextResponse.json(summary);

  for (let i = 0; i < cards.length; i += PARALLELISM) {
    const slice = cards.slice(i, i + PARALLELISM);
    await Promise.all(
      slice.map((card) =>
        processCard(card, service, summary).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          summary.errors.push({ card_id: card.id, message: `unexpected: ${message}` });
        }),
      ),
    );
  }

  await snapshotStockValue(service);

  return NextResponse.json(summary);
}

async function snapshotStockValue(
  service: ReturnType<typeof createServiceClient>,
): Promise<void> {
  try {
    const { data, error } = await service
      .from('cards')
      .select('status, cm_price_avg, cm_price_trend, cm_price_low')
      .in('status', ['for_sale', 'collection']);
    if (error) throw error;
    const snapshot = computeStockValue(data ?? []);
    const today = new Date().toISOString().slice(0, 10);
    const { error: upsertErr } = await service
      .from('stock_value_snapshots')
      .upsert({ date: today, ...snapshot }, { onConflict: 'date' });
    if (upsertErr) throw upsertErr;
  } catch (err) {
    console.warn('[stock_value_snapshots] upsert failed (non-fatal):', err);
  }
}

async function processCard(
  card: Card,
  service: ReturnType<typeof createServiceClient>,
  summary: UpdateSummary,
): Promise<void> {
  const cat = categorizePricingCard(card);
  if (cat === 'skip') {
    summary.skipped += 1;
    return;
  }

  let cardIdTcg = card.card_id_tcg;
  let backfilled = false;

  if (cat === 'backfill') {
    if (!card.set_code || !card.set_number) {
      summary.errors.push({ card_id: card.id, message: 'backfill: missing set_code or set_number' });
      return;
    }
    try {
      const row = await lookupByCode(service, card.set_code, card.set_number, card.language);
      if (!row) {
        summary.skipped += 1;
        return;
      }
      cardIdTcg = `${row.set_code}-${row.set_number}`;
      backfilled = true;
    } catch (err) {
      summary.errors.push({ card_id: card.id, message: `backfill: ${(err as Error).message}` });
      return;
    }
  }

  // cardIdTcg may still be null (e.g. JP card with no catalog match) — that's
  // fine, the cardmarket dumps don't need it. We pass it as a fallback for
  // TCGdex if the dumps miss.
  const resolved = await resolvePricing(service, card, cardIdTcg);
  if (!resolved.ok) {
    if (resolved.terminal) {
      console.warn(`[prices/cron] ${card.id} (${card.card_name} ${card.set_code}-${card.set_number} ${card.language}) → ${resolved.reason}`);
      summary.errors.push({ card_id: card.id, message: resolved.reason });
    } else {
      // Soft miss (no pricing yet from either source) — don't bump cm_updated_at.
      summary.skipped += 1;
    }
    return;
  }

  const p = resolved.pricing;
  const update: Record<string, unknown> = {
    cm_price_low: p.low,
    cm_price_trend: p.trend,
    cm_price_avg: p.avg,
    cm_updated_at: new Date().toISOString(),
    cardmarket_url: p.url,
  };
  if (p.idProduct != null) update.cardmarket_id = String(p.idProduct);
  if (backfilled) update.card_id_tcg = cardIdTcg;

  const { error: updErr } = await service.from('cards').update(update).eq('id', card.id);
  if (updErr) {
    summary.errors.push({ card_id: card.id, message: `update: ${updErr.message}` });
    return;
  }

  summary.updated += 1;
  if (backfilled) summary.backfilled += 1;
  if (p.source === 'cardmarket') summary.source_cardmarket += 1;
  else summary.source_tcgdex += 1;
  if (p.ambiguous) summary.ambiguous += 1;
}

/**
 * Pricing pipeline: Cardmarket dumps first (local lookup, no network), TCGdex
 * fallback (live API) for cards we can't match in the dumps. Returns a
 * discriminated union so the caller can distinguish a terminal error (worth
 * surfacing in summary.errors) from a soft miss (no pricing yet, skip & retry).
 */
type ResolveResult =
  | { ok: true; pricing: ResolvedPricing }
  | { ok: false; reason: string; terminal: boolean };

async function resolvePricing(
  service: ReturnType<typeof createServiceClient>,
  card: Card,
  cardIdTcgForFallback: string | null,
): Promise<ResolveResult> {
  const cm = await lookupCardmarketPricing(service, card);
  if (cm.ok) {
    console.warn(`[cm-lookup] ${card.id} ${card.set_name}/${card.card_name} (${card.language}) → matched idProduct=${cm.idProduct}${cm.ambiguous ? ' [AMBIG]' : ''} src=${cm.source}`);
    return {
      ok: true,
      pricing: {
        source: 'cardmarket',
        idProduct: cm.idProduct,
        low: cm.low,
        trend: cm.trend,
        avg: cm.avg,
        ambiguous: cm.ambiguous,
        url: cm.urlPath ? `${CARDMARKET_BASE_URL}${cm.urlPath}` : null,
      },
    };
  }
  console.warn(`[cm-lookup] ${card.id} ${card.set_name}/${card.card_name} (${card.language}) → ${cm.reason}${cm.details ? ` [${cm.details}]` : ''}; falling back to TCGdex`);

  if (!cardIdTcgForFallback) {
    return { ok: false, reason: `dumps:${cm.reason} + no_card_id_tcg`, terminal: false };
  }

  const translatedId = await tcgdexCardId(card.set_name, card.set_number, card.language);
  const finalId = translatedId ?? cardIdTcgForFallback;
  const fetched = await fetchTCGdexPricing(finalId, card.language);
  if (fetched.error) {
    return { ok: false, reason: `dumps:${cm.reason} + tcgdex:${fetched.error} (id=${finalId})`, terminal: true };
  }
  const t = fetched.cm;
  if (!t || (t.low == null && t.trend == null && t.avg == null)) {
    return { ok: false, reason: `dumps:${cm.reason} + tcgdex: no pricing yet`, terminal: false };
  }
  return {
    ok: true,
    pricing: {
      source: 'tcgdex',
      idProduct: t.idProduct ?? null,
      low: t.low ?? null,
      trend: t.trend ?? null,
      avg: t.avg ?? null,
      ambiguous: false,
      url: null,
    },
  };
}

async function fetchTCGdexPricing(
  cardIdTcg: string,
  language: CardLanguage,
): Promise<{ cm?: TCGdexCardmarket | null; error?: string }> {
  const lang = toTCGdexLang(language);
  const url = `${TCGDEX_BASE}/${lang}/cards/${encodeURIComponent(cardIdTcg)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TCGDEX_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return { error: `tcgdex ${res.status}` };
    const json = (await res.json()) as TCGdexCardResponse;
    return { cm: json.pricing?.cardmarket ?? null };
  } catch (err) {
    return { error: `tcgdex fetch: ${(err as Error).message}` };
  } finally {
    clearTimeout(timer);
  }
}

async function handleSingleCard(cardId: string): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const service = createServiceClient();

  const { data: target, error: readErr } = await service
    .from('cards')
    .select('*')
    .eq('id', cardId)
    .single();
  if (readErr || !target) {
    return notFoundResponse('card');
  }

  const card = target as Card;
  const cat = categorizePricingCard(card);
  if (cat === 'skip') {
    return apiError('card_not_eligible', {
      status: 422,
      message: card.variant
        ? 'Variants (Pokéball, Master Ball, etc.) gardent leur prix manuel.'
        : 'Identifiants de set manquants — édite le prix à la main.',
    });
  }

  let cardIdTcg = card.card_id_tcg;
  let backfilled = false;
  if (cat === 'backfill') {
    if (!card.set_code || !card.set_number) {
      return apiError('no_catalog_match', { status: 422 });
    }
    const row = await lookupByCode(service, card.set_code, card.set_number, card.language);
    if (!row) {
      return apiError('no_catalog_match', { status: 422 });
    }
    cardIdTcg = `${row.set_code}-${row.set_number}`;
    backfilled = true;
  }

  // The Cardmarket dumps don't need cardIdTcg, so we no longer hard-fail when
  // it's null. resolvePricing() will try the dumps first, then TCGdex if a
  // cardIdTcg is available.
  const resolved = await resolvePricing(service, card, cardIdTcg);
  if (!resolved.ok) {
    console.warn(`[prices/single] ${card.id} (${card.card_name} ${card.set_code}-${card.set_number} ${card.language}) → ${resolved.reason}`);
    return apiError(resolved.terminal ? 'pricing_failed' : 'no_pricing_yet', {
      status: resolved.terminal ? 502 : 422,
      message: resolved.reason,
    });
  }

  const p = resolved.pricing;
  const update: Record<string, unknown> = {
    cm_price_low: p.low,
    cm_price_trend: p.trend,
    cm_price_avg: p.avg,
    cm_updated_at: new Date().toISOString(),
    cardmarket_url: p.url,
  };
  if (p.idProduct != null) update.cardmarket_id = String(p.idProduct);
  if (backfilled) update.card_id_tcg = cardIdTcg;

  const { data: updated, error: updErr } = await service
    .from('cards')
    .update(update)
    .eq('id', cardId)
    .select('*')
    .single();
  if (updErr) {
    return apiError('update_failed', { status: 500, message: updErr.message });
  }

  return NextResponse.json({ ok: true, card: updated });
}
