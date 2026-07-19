import { describe, it, expect, vi } from 'vitest';
import { fetchHistoryForCardIds, fetchHistoryForCard } from './price-history';

/**
 * Chainable supabase builder stub: every filter/order call returns the builder
 * itself; `.range()` resolves with the next queued page. Queue one page per
 * expected request (fetchAllRows stops on the first short page).
 */
function makeSupabase(pages: Array<{ data: unknown[] | null; error: { message: string } | null }>) {
  let call = 0;
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'in', 'eq', 'gte', 'order']) {
    builder[m] = vi.fn(() => builder);
  }
  builder.range = vi.fn(() => Promise.resolve(pages[Math.min(call++, pages.length - 1)]));
  const fromMock = vi.fn(() => builder);
  return {
    supabase: { from: fromMock } as unknown as Parameters<typeof fetchHistoryForCard>[0],
    fromMock,
    builder,
  };
}

describe('fetchHistoryForCardIds', () => {
  it('returns Map keyed by card_id with sorted points', async () => {
    const { supabase } = makeSupabase([
      {
        data: [
          { card_id: 'a', bucket_date: '2026-05-12', granularity: 'daily', cm_price_avg: 4.0, cm_price_low: null, cm_price_trend: null, source_freshness_days: 0 },
          { card_id: 'a', bucket_date: '2026-05-13', granularity: 'daily', cm_price_avg: 4.2, cm_price_low: null, cm_price_trend: null, source_freshness_days: 0 },
          { card_id: 'b', bucket_date: '2026-05-13', granularity: 'daily', cm_price_avg: 1.0, cm_price_low: null, cm_price_trend: null, source_freshness_days: 0 },
        ],
        error: null,
      },
    ]);
    const map = await fetchHistoryForCardIds(supabase, ['a', 'b'], 90);
    expect(map.get('a')).toHaveLength(2);
    expect(map.get('b')).toHaveLength(1);
    expect(map.get('a')![0].bucket_date).toBe('2026-05-12');
  });

  it('returns empty Map when no card_ids provided', async () => {
    const { supabase, fromMock } = makeSupabase([{ data: [], error: null }]);
    const map = await fetchHistoryForCardIds(supabase, [], 90);
    expect(map.size).toBe(0);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('chunks large id lists into multiple requests', async () => {
    const { supabase, fromMock } = makeSupabase([{ data: [], error: null }]);
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    await fetchHistoryForCardIds(supabase, ids, 90);
    // 250 ids / 100 per chunk = 3 parallel requests.
    expect(fromMock).toHaveBeenCalledTimes(3);
  });

  it('throws when supabase returns an error', async () => {
    const { supabase } = makeSupabase([{ data: null, error: { message: 'boom' } }]);
    await expect(fetchHistoryForCardIds(supabase, ['a'], 90)).rejects.toThrow('boom');
  });
});

describe('fetchHistoryForCard', () => {
  it('fetches all granularities ascending', async () => {
    const { supabase } = makeSupabase([
      {
        data: [
          { card_id: 'c', bucket_date: '2026-01-01', granularity: 'monthly', cm_price_avg: 3.5, cm_price_low: null, cm_price_trend: null, source_freshness_days: 1 },
          { card_id: 'c', bucket_date: '2026-05-01', granularity: 'weekly',  cm_price_avg: 4.0, cm_price_low: null, cm_price_trend: null, source_freshness_days: 1 },
          { card_id: 'c', bucket_date: '2026-05-13', granularity: 'daily',   cm_price_avg: 4.2, cm_price_low: null, cm_price_trend: null, source_freshness_days: 0 },
        ],
        error: null,
      },
    ]);
    const points = await fetchHistoryForCard(supabase, 'c', 90);
    expect(points).toHaveLength(3);
    expect(points[0].granularity).toBe('monthly');
    expect(points[2].granularity).toBe('daily');
  });

  it('drops the gte filter when windowDays is null', async () => {
    const { supabase, builder } = makeSupabase([{ data: [], error: null }]);
    const points = await fetchHistoryForCard(supabase, 'c', null);
    expect(points).toEqual([]);
    expect(builder.gte).not.toHaveBeenCalled();
    expect(builder.range).toHaveBeenCalled();
  });

  it('pages past the 1000-row response cap', async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({
      card_id: 'c', bucket_date: `d${i}`, granularity: 'daily', cm_price_avg: 1, cm_price_low: null, cm_price_trend: null, source_freshness_days: 0,
    }));
    const { supabase, builder } = makeSupabase([
      { data: fullPage, error: null },
      { data: fullPage.slice(0, 250), error: null },
    ]);
    const points = await fetchHistoryForCard(supabase, 'c', null);
    expect(points).toHaveLength(1250);
    expect(builder.range).toHaveBeenCalledTimes(2);
    expect(builder.range).toHaveBeenNthCalledWith(2, 1000, 1999);
  });
});
