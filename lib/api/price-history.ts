import type { SupabaseClient } from '@supabase/supabase-js';
import type { PriceHistoryPoint } from '@/lib/types/price-history';

/**
 * Bulk fetch the last `windowDays` days of price history for the given card
 * IDs. Returns a Map keyed by card_id with chronologically sorted points.
 *
 * Used by <PriceTrendsProvider> to feed inline trend arrows on Stock,
 * Pokédex, Dashboard, Vinted, and Prix pages without N+1.
 */
export async function fetchHistoryForCardIds(
  supabase: SupabaseClient,
  cardIds: string[],
  windowDays: number,
): Promise<Map<string, PriceHistoryPoint[]>> {
  const result = new Map<string, PriceHistoryPoint[]>();
  if (cardIds.length === 0) return result;

  const since = new Date(Date.now() - windowDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await supabase
    .from('price_history')
    .select('card_id, bucket_date, granularity, cm_price_low, cm_price_trend, cm_price_avg, source_freshness_days')
    .in('card_id', cardIds)
    .gte('bucket_date', since)
    .order('bucket_date', { ascending: true });

  if (error) throw new Error(error.message);

  for (const row of (data ?? []) as PriceHistoryPoint[]) {
    const arr = result.get(row.card_id);
    if (arr) arr.push(row);
    else result.set(row.card_id, [row]);
  }
  return result;
}

/**
 * Fetch all history for one card going back `windowDays` days. Used by the
 * detail modal which needs up to 1 year (DeltaMatrix Δ1an cell) or unlimited
 * ("tout" toggle). Returns chronologically ascending points across all
 * granularities (daily, weekly, monthly).
 *
 * Pass `windowDays = null` for an unlimited window.
 */
export async function fetchHistoryForCard(
  supabase: SupabaseClient,
  cardId: string,
  windowDays: number | null,
): Promise<PriceHistoryPoint[]> {
  let query = supabase
    .from('price_history')
    .select('card_id, bucket_date, granularity, cm_price_low, cm_price_trend, cm_price_avg, source_freshness_days')
    .eq('card_id', cardId);

  if (windowDays != null) {
    const since = new Date(Date.now() - windowDays * 86_400_000).toISOString().slice(0, 10);
    query = query.gte('bucket_date', since);
  }

  const { data, error } = await query.order('bucket_date', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PriceHistoryPoint[];
}
