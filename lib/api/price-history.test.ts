import { describe, it, expect, vi } from 'vitest';
import { fetchHistoryForCardIds } from './price-history';

const fromMock = vi.fn();
const supabase = { from: fromMock } as any;

describe('fetchHistoryForCardIds', () => {
  it('returns Map keyed by card_id with sorted points', async () => {
    fromMock.mockReturnValue({
      select: () => ({
        in: () => ({
          gte: () => ({
            order: () =>
              Promise.resolve({
                data: [
                  { card_id: 'a', bucket_date: '2026-05-12', granularity: 'daily', cm_price_avg: 4.0, cm_price_low: null, cm_price_trend: null, source_freshness_days: 0 },
                  { card_id: 'a', bucket_date: '2026-05-13', granularity: 'daily', cm_price_avg: 4.2, cm_price_low: null, cm_price_trend: null, source_freshness_days: 0 },
                  { card_id: 'b', bucket_date: '2026-05-13', granularity: 'daily', cm_price_avg: 1.0, cm_price_low: null, cm_price_trend: null, source_freshness_days: 0 },
                ],
                error: null,
              }),
          }),
        }),
      }),
    });
    const map = await fetchHistoryForCardIds(supabase, ['a', 'b'], 90);
    expect(map.get('a')).toHaveLength(2);
    expect(map.get('b')).toHaveLength(1);
    expect(map.get('a')![0].bucket_date).toBe('2026-05-12');
  });

  it('returns empty Map when no card_ids provided', async () => {
    const map = await fetchHistoryForCardIds(supabase, [], 90);
    expect(map.size).toBe(0);
  });

  it('throws when supabase returns an error', async () => {
    fromMock.mockReturnValue({
      select: () => ({
        in: () => ({
          gte: () => ({
            order: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
          }),
        }),
      }),
    });
    await expect(fetchHistoryForCardIds(supabase, ['a'], 90)).rejects.toThrow('boom');
  });
});
