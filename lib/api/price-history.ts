import type { SupabaseClient } from '@supabase/supabase-js';
import type { PriceHistoryPoint } from '@/lib/types/price-history';
import { fetchAllRows, chunkArray } from './fetch-all';

/** Max card ids per `.in()` filter — keeps request URLs small (a UUID is ~37
 *  chars and Supabase encodes the whole list in the query string). */
const ID_CHUNK_SIZE = 100;

/**
 * Bulk fetch the last `windowDays` days of price history for the given card
 * IDs. Returns a Map keyed by card_id with chronologically sorted points.
 *
 * Used by <PriceTrendsProvider> to feed inline trend arrows on Stock,
 * Pokédex, Dashboard, Vinted, and Prix pages without N+1.
 *
 * Ids are chunked and each chunk paginated: N cards × 90 daily points blows
 * past Supabase's 1000-row response cap fast, which used to silently drop
 * trend arrows.
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

  const chunkResults = await Promise.all(
    chunkArray(cardIds, ID_CHUNK_SIZE).map((ids) =>
      fetchAllRows<PriceHistoryPoint>((from, to) =>
        supabase
          .from('price_history')
          .select('card_id, bucket_date, granularity, cm_price_low, cm_price_trend, cm_price_avg, source_freshness_days')
          .in('card_id', ids)
          .gte('bucket_date', since)
          // (bucket_date, card_id, granularity) is unique → stable pagination.
          .order('bucket_date', { ascending: true })
          .order('card_id', { ascending: true })
          .order('granularity', { ascending: true })
          .range(from, to),
      ),
    ),
  );

  for (const { data, error } of chunkResults) {
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as PriceHistoryPoint[]) {
      const arr = result.get(row.card_id);
      if (arr) arr.push(row);
      else result.set(row.card_id, [row]);
    }
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
  // Paginated: the unlimited window accumulates one daily row per day, so a
  // card tracked for ~3 years crosses the 1000-row response cap.
  const { data, error } = await fetchAllRows<PriceHistoryPoint>((from, to) => {
    let query = supabase
      .from('price_history')
      .select('card_id, bucket_date, granularity, cm_price_low, cm_price_trend, cm_price_avg, source_freshness_days')
      .eq('card_id', cardId);

    if (windowDays != null) {
      const since = new Date(Date.now() - windowDays * 86_400_000).toISOString().slice(0, 10);
      query = query.gte('bucket_date', since);
    }

    return query
      .order('bucket_date', { ascending: true })
      .order('granularity', { ascending: true })
      .range(from, to);
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as PriceHistoryPoint[];
}
