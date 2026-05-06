// app/api/prices/update/route.ts
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';
import { categorizePricingCard } from '@/lib/utils/categorize-pricing-card';
import { lookupByCode } from '@/lib/api/tcg-catalog';
import { toTCGdexLang } from '@/lib/api/tcgdex';
import { computeStockValue } from '@/lib/utils/stock-value';
import type { Card, CardLanguage } from '@/lib/types';

export const runtime = 'nodejs';

const BATCH_SIZE = 200;
const PARALLELISM = 10;
const TCGDEX_BASE = 'https://api.tcgdex.net/v2';
const TCGDEX_TIMEOUT_MS = 15_000;

interface UpdateSummary {
  ok: boolean;
  total: number;
  updated: number;
  backfilled: number;
  skipped: number;
  errors: Array<{ card_id: string; message: string }>;
}

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
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function POST(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const cardId = url.searchParams.get('card_id');
  if (cardId) return handleSingleCard(cardId);

  const auth = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!auth || !secret || auth !== `Bearer ${secret}`) return unauthorized();

  return handleBulk();
}

async function handleBulk(): Promise<NextResponse> {
  const service = createServiceClient();
  const summary: UpdateSummary = {
    ok: true, total: 0, updated: 0, backfilled: 0, skipped: 0, errors: [],
  };

  const { data: rows, error } = await service
    .from('cards')
    .select('*')
    .eq('status', 'for_sale')
    .order('cm_updated_at', { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE);

  if (error) {
    return NextResponse.json(
      { ok: false, error: `read failed: ${error.message}` },
      { status: 500 },
    );
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

  if (!cardIdTcg) {
    summary.skipped += 1;
    return;
  }

  const fetched = await fetchTCGdexPricing(cardIdTcg, card.language);
  if (fetched.error) {
    summary.errors.push({ card_id: card.id, message: fetched.error });
    return;
  }
  const cm = fetched.cm;
  if (!cm || (cm.low == null && cm.trend == null && cm.avg == null)) {
    // No pricing data yet → don't bump cm_updated_at, retry tomorrow.
    summary.skipped += 1;
    return;
  }

  const update: Record<string, unknown> = {
    cm_price_low: cm.low ?? null,
    cm_price_trend: cm.trend ?? null,
    cm_price_avg: cm.avg ?? null,
    cm_updated_at: new Date().toISOString(),
  };
  if (cm.idProduct != null) update.cardmarket_id = String(cm.idProduct);
  if (backfilled) update.card_id_tcg = cardIdTcg;

  const { error: updErr } = await service.from('cards').update(update).eq('id', card.id);
  if (updErr) {
    summary.errors.push({ card_id: card.id, message: `update: ${updErr.message}` });
    return;
  }

  summary.updated += 1;
  if (backfilled) summary.backfilled += 1;
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
    return NextResponse.json({ ok: false, error: 'card_not_found' }, { status: 404 });
  }

  const card = target as Card;
  const cat = categorizePricingCard(card);
  if (cat === 'skip') {
    return NextResponse.json(
      { ok: false, error: 'card_not_eligible', reason: 'variant or missing identifiers' },
      { status: 422 },
    );
  }

  let cardIdTcg = card.card_id_tcg;
  let backfilled = false;
  if (cat === 'backfill') {
    if (!card.set_code || !card.set_number) {
      return NextResponse.json(
        { ok: false, error: 'no_catalog_match' },
        { status: 422 },
      );
    }
    const row = await lookupByCode(service, card.set_code, card.set_number, card.language);
    if (!row) {
      return NextResponse.json(
        { ok: false, error: 'no_catalog_match' },
        { status: 422 },
      );
    }
    cardIdTcg = `${row.set_code}-${row.set_number}`;
    backfilled = true;
  }

  if (!cardIdTcg) {
    return NextResponse.json(
      { ok: false, error: 'card_not_eligible' },
      { status: 422 },
    );
  }

  const fetched = await fetchTCGdexPricing(cardIdTcg, card.language);
  if (fetched.error) {
    return NextResponse.json(
      { ok: false, error: 'tcgdex_failed', message: fetched.error },
      { status: 502 },
    );
  }
  const cm = fetched.cm;
  if (!cm || (cm.low == null && cm.trend == null && cm.avg == null)) {
    return NextResponse.json(
      { ok: false, error: 'no_pricing_yet' },
      { status: 422 },
    );
  }

  const update: Record<string, unknown> = {
    cm_price_low: cm.low ?? null,
    cm_price_trend: cm.trend ?? null,
    cm_price_avg: cm.avg ?? null,
    cm_updated_at: new Date().toISOString(),
  };
  if (cm.idProduct != null) update.cardmarket_id = String(cm.idProduct);
  if (backfilled) update.card_id_tcg = cardIdTcg;

  const { data: updated, error: updErr } = await service
    .from('cards')
    .update(update)
    .eq('id', cardId)
    .select('*')
    .single();
  if (updErr) {
    return NextResponse.json(
      { ok: false, error: 'update_failed', message: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, card: updated });
}
