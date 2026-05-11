// Two entry paths sharing one per-card pipeline:
//
//   GET  /api/prices/update                    → cron (auth: Bearer CRON_SECRET) → bulk
//   POST /api/prices/update?card_id=<uuid>     → UI button (auth: Supabase session) → single
//   GET  /api/prices/update?card_id=<uuid>     → also single (same handler)
//
// Per-card logic lives in processCardForPricing() and returns a discriminated
// union; the bulk + single paths each translate the result into their own
// response shape (summary counters vs HTTP body).

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
const CARDMARKET_BASE_URL = 'https://www.cardmarket.com';

type ServiceClient = ReturnType<typeof createServiceClient>;

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

/**
 * Per-card outcome — both bulk and single-card paths translate this into their
 * native response shape (summary entry vs NextResponse).
 */
type CardProcessResult =
  | { kind: 'updated'; updatedCard: Card; pricing: ResolvedPricing; backfilled: boolean }
  | {
      kind: 'skipped';
      reason: 'not_eligible' | 'backfill_no_match' | 'no_pricing_yet';
      /** Free-form context — for `no_pricing_yet` this is the lookup chain
       *  reason ("dumps:no_expansion + tcgdex: no pricing yet") so cron logs
       *  + single-card UI surface why we skipped, not just that we did. */
      details?: string;
    }
  | { kind: 'invalid_for_pricing'; code: 'card_not_eligible' | 'no_catalog_match'; message?: string }
  | { kind: 'pricing_failed'; reason: string }
  | { kind: 'update_failed'; message: string }
  | { kind: 'unexpected'; message: string };

interface TCGdexCardmarket {
  idProduct?: number;
  low?: number;
  trend?: number;
  avg?: number;
}

interface TCGdexCardResponse {
  pricing?: { cardmarket?: TCGdexCardmarket | null };
}

// ---------------------------------------------------------------------------
// Entry routing
// ---------------------------------------------------------------------------

async function handleRequest(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const cardId = url.searchParams.get('card_id');
  if (cardId) return handleSingleCard(cardId);

  const auth = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!auth || !secret || auth !== `Bearer ${secret}`) return unauthorizedResponse();

  return handleBulk();
}

// Vercel cron daemon issues GET (User-Agent: vercel-cron/1.0).
// The single-card refresh from the UI uses POST. Share the same logic.
export const GET = handleRequest;
export const POST = handleRequest;

// ---------------------------------------------------------------------------
// Per-card pipeline (shared between bulk + single)
// ---------------------------------------------------------------------------

/**
 * Run the full pricing flow for one card: categorize → backfill if needed →
 * resolve pricing (Cardmarket dumps then TCGdex) → persist update. Returns a
 * structured result for the caller to translate into its response.
 */
async function processCardForPricing(
  card: Card,
  service: ServiceClient,
): Promise<CardProcessResult> {
  const cat = categorizePricingCard(card);
  if (cat === 'skip') {
    return {
      kind: 'invalid_for_pricing',
      code: 'card_not_eligible',
      message: (card.variant && card.variant !== 'promo')
        ? 'Variants (Pokéball, Master Ball, etc.) gardent leur prix manuel.'
        : 'Identifiants de set manquants — édite le prix à la main.',
    };
  }

  let cardIdTcg = card.card_id_tcg;
  let backfilled = false;

  if (cat === 'backfill') {
    if (!card.set_code || !card.set_number) {
      return { kind: 'invalid_for_pricing', code: 'no_catalog_match' };
    }
    try {
      const row = await lookupByCode(service, card.set_code, card.set_number, card.language);
      if (!row) {
        return { kind: 'invalid_for_pricing', code: 'no_catalog_match' };
      }
      cardIdTcg = `${row.set_code}-${row.set_number}`;
      backfilled = true;
    } catch (err) {
      return { kind: 'unexpected', message: `backfill: ${(err as Error).message}` };
    }
  }

  // cardIdTcg may still be null (e.g. JP card with no catalog match) — that's
  // fine, the cardmarket dumps don't need it. We pass it as a fallback for
  // TCGdex if the dumps miss.
  const resolved = await resolvePricing(service, card, cardIdTcg);
  if (!resolved.ok) {
    if (resolved.terminal) return { kind: 'pricing_failed', reason: resolved.reason };
    return { kind: 'skipped', reason: 'no_pricing_yet', details: resolved.reason };
  }

  const update = buildUpdatePayload(resolved.pricing, backfilled, cardIdTcg);
  const { data: updated, error: updErr } = await service
    .from('cards')
    .update(update)
    .eq('id', card.id)
    .select('*')
    .single();
  if (updErr) {
    return { kind: 'update_failed', message: updErr.message };
  }

  return {
    kind: 'updated',
    updatedCard: updated as Card,
    pricing: resolved.pricing,
    backfilled,
  };
}

/** Build the SQL UPDATE payload from a resolved pricing — used by both paths. */
function buildUpdatePayload(
  p: ResolvedPricing,
  backfilled: boolean,
  cardIdTcg: string | null,
): Record<string, unknown> {
  const update: Record<string, unknown> = {
    cm_price_low: p.low,
    cm_price_trend: p.trend,
    cm_price_avg: p.avg,
    cm_updated_at: new Date().toISOString(),
    cardmarket_url: p.url,
  };
  if (p.idProduct != null) update.cardmarket_id = String(p.idProduct);
  if (backfilled && cardIdTcg) update.card_id_tcg = cardIdTcg;
  return update;
}

// ---------------------------------------------------------------------------
// Bulk path (cron)
// ---------------------------------------------------------------------------

async function handleBulk(): Promise<NextResponse> {
  const service = createServiceClient();
  const summary: UpdateSummary = {
    ok: true, total: 0, updated: 0, backfilled: 0, skipped: 0,
    source_cardmarket: 0, source_tcgdex: 0, ambiguous: 0, errors: [],
  };

  // Bulk scope: for_sale + pokedex + collection. Sold cards have a final
  // sold_price (no need to refresh), and a Pokédex/collection card's CM price
  // is just as relevant to net-worth tracking as a for_sale one — the cron
  // shouldn't leave them stale.
  const { data: rows, error } = await service
    .from('cards')
    .select('*')
    .in('status', ['for_sale', 'pokedex', 'collection'])
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
      slice.map(async (card) => {
        try {
          const result = await processCardForPricing(card, service);
          applyResultToSummary(card, result, summary);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          summary.errors.push({ card_id: card.id, message: `unexpected: ${message}` });
        }
      }),
    );
  }

  await snapshotStockValue(service);

  return NextResponse.json(summary);
}

/** Translate a per-card result into UpdateSummary mutations (bulk-only). */
function applyResultToSummary(card: Card, result: CardProcessResult, summary: UpdateSummary): void {
  switch (result.kind) {
    case 'updated':
      summary.updated += 1;
      if (result.backfilled) summary.backfilled += 1;
      if (result.pricing.source === 'cardmarket') summary.source_cardmarket += 1;
      else summary.source_tcgdex += 1;
      if (result.pricing.ambiguous) summary.ambiguous += 1;
      return;
    case 'skipped':
      // `no_pricing_yet` is transient (we'll retry on the next cron tick) — log
      // it so we can spot persistent gaps in the daily Vercel logs. Other
      // skipped reasons are silent on purpose (variant cards, missing IDs).
      if (result.reason === 'no_pricing_yet') {
        console.warn(
          `[prices/cron] ${card.id} (${card.card_name} ${card.set_code}-${card.set_number} ${card.language}) → transient: ${result.details ?? result.reason}`,
        );
      }
      summary.skipped += 1;
      return;
    case 'invalid_for_pricing':
      // The cron only sees `card_not_eligible` (categorize=skip) for variant
      // / missing-id cards — those are silently skipped, not surfaced as errors.
      // `no_catalog_match` from backfill is also silent (the row is just not
      // matchable, the user can manually price it).
      summary.skipped += 1;
      return;
    case 'pricing_failed':
      console.warn(
        `[prices/cron] ${card.id} (${card.card_name} ${card.set_code}-${card.set_number} ${card.language}) → ${result.reason}`,
      );
      summary.errors.push({ card_id: card.id, message: result.reason });
      return;
    case 'update_failed':
      summary.errors.push({ card_id: card.id, message: `update: ${result.message}` });
      return;
    case 'unexpected':
      summary.errors.push({ card_id: card.id, message: result.message });
      return;
  }
}

async function snapshotStockValue(service: ServiceClient): Promise<void> {
  try {
    const { data, error } = await service
      .from('cards')
      .select('status, cm_price_avg, cm_price_trend, cm_price_low')
      .in('status', ['for_sale', 'collection', 'pokedex']);
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

// ---------------------------------------------------------------------------
// Single-card path (UI button)
// ---------------------------------------------------------------------------

async function handleSingleCard(cardId: string): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return unauthorizedResponse();

  // Read through the session client so RLS auto-filters the moment cards
  // grow per-user ownership (today the policy is `using (true)` so behavior
  // is identical, but this preserves the right semantics for future-proofing).
  const { data: target, error: readErr } = await supabase
    .from('cards')
    .select('*')
    .eq('id', cardId)
    .single();
  if (readErr || !target) return notFoundResponse('card');

  // Pricing pipeline keeps the service role for the catalog/cardmarket
  // lookups + the cards UPDATE — those are infrastructure-level writes that
  // should bypass RLS regardless of how the cards policy evolves.
  const service = createServiceClient();
  const result = await processCardForPricing(target as Card, service);
  return resultToSingleCardResponse(target as Card, result);
}

/** Translate a per-card result into a NextResponse (single-card path only). */
function resultToSingleCardResponse(card: Card, result: CardProcessResult): NextResponse {
  switch (result.kind) {
    case 'updated':
      return NextResponse.json({ ok: true, card: result.updatedCard });
    case 'invalid_for_pricing':
      return apiError(result.code, { status: 422, message: result.message });
    case 'skipped':
      // No pricing available yet (typically backfill matched but TCGdex has no pricing
      // returned for that ID). Surface as 422 so the UI shows "no_pricing_yet".
      return apiError('no_pricing_yet', { status: 422, message: result.details ?? result.reason });
    case 'pricing_failed':
      console.warn(
        `[prices/single] ${card.id} (${card.card_name} ${card.set_code}-${card.set_number} ${card.language}) → ${result.reason}`,
      );
      return apiError('pricing_failed', { status: 502, message: result.reason });
    case 'update_failed':
      return apiError('update_failed', { status: 500, message: result.message });
    case 'unexpected':
      return apiError('unexpected', { status: 500, message: result.message });
  }
}

// ---------------------------------------------------------------------------
// Pricing resolver — Cardmarket dumps then TCGdex live fallback
// ---------------------------------------------------------------------------

type ResolveResult =
  | { ok: true; pricing: ResolvedPricing }
  | { ok: false; reason: string; terminal: boolean };

async function resolvePricing(
  service: ServiceClient,
  card: Card,
  cardIdTcgForFallback: string | null,
): Promise<ResolveResult> {
  const cm = await lookupCardmarketPricing(service, card);
  if (cm.ok) {
    console.warn(
      `[cm-lookup] ${card.id} ${card.set_name}/${card.card_name} (${card.language}) → matched idProduct=${cm.idProduct}${cm.ambiguous ? ' [AMBIG]' : ''} src=${cm.source}`,
    );
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
  console.warn(
    `[cm-lookup] ${card.id} ${card.set_name}/${card.card_name} (${card.language}) → ${cm.reason}${cm.details ? ` [${cm.details}]` : ''}; falling back to TCGdex`,
  );

  if (!cardIdTcgForFallback) {
    return { ok: false, reason: `dumps:${cm.reason} + no_card_id_tcg`, terminal: false };
  }

  const translatedId = await tcgdexCardId(card.set_name, card.set_number, card.language);
  const finalId = translatedId ?? cardIdTcgForFallback;
  const fetched = await fetchTCGdexPricing(finalId, card.language);
  if (fetched.error) {
    return {
      ok: false,
      reason: `dumps:${cm.reason} + tcgdex:${fetched.error} (id=${finalId})`,
      terminal: true,
    };
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
