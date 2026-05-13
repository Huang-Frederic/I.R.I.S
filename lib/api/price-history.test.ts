import { describe, it, expect, vi } from 'vitest';
import { fetchHistoryForCardIds, fetchHistoryForCard } from './price-history';

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

describe('fetchHistoryForCard', () => {
  it('fetches all granularities ascending', async () => {
    const fromMock = vi.fn().mockReturnValue({
      select: () => ({
        eq: () => ({
          gte: () => ({
            order: () =>
              Promise.resolve({
                data: [
                  { card_id: 'c', bucket_date: '2026-01-01', granularity: 'monthly', cm_price_avg: 3.5, cm_price_low: null, cm_price_trend: null, source_freshness_days: 1 },
                  { card_id: 'c', bucket_date: '2026-05-01', granularity: 'weekly',  cm_price_avg: 4.0, cm_price_low: null, cm_price_trend: null, source_freshness_days: 1 },
                  { card_id: 'c', bucket_date: '2026-05-13', granularity: 'daily',   cm_price_avg: 4.2, cm_price_low: null, cm_price_trend: null, source_freshness_days: 0 },
                ],
                error: null,
              }),
          }),
        }),
      }),
    });
    const supabase = { from: fromMock } as any;
    const points = await fetchHistoryForCard(supabase, 'c', 90);
    expect(points).toHaveLength(3);
    expect(points[0].granularity).toBe('monthly');
    expect(points[2].granularity).toBe('daily');
  });

  it('drops the gte filter when windowDays is null', async () => {
    const orderMock = vi.fn().mockResolvedValue({ data: [], error: null });
    const fromMock = vi.fn().mockReturnValue({
      select: () => ({ eq: () => ({ order: orderMock, gte: vi.fn() }) }),
    });
    const supabase = { from: fromMock } as any;
    await fetchHistoryForCard(supabase, 'c', null);
    expect(orderMock).toHaveBeenCalled();
  });
});
