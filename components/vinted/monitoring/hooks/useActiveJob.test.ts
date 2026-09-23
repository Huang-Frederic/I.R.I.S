import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useActiveJob } from './useActiveJob';

const supabaseMock = { from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() };
vi.mock('@/lib/supabase/client', () => ({ createClient: () => supabaseMock }));

function mockChannel() {
  const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() };
  supabaseMock.channel.mockReturnValue(channel);
  return channel;
}

/** `processingJob` — the row `.maybeSingle()` should resolve to (or null).
 *  `pendingCount` — what the count-only query should resolve to.
 *  `cardOrLot` — the row `.maybeSingle()` should resolve to when the hook
 *  looks up the card/lot's name+image (only reached when `processingJob` is
 *  non-null). */
function mockJobsTable(opts: {
  processingJob: Record<string, unknown> | null;
  pendingCount: number;
  cardOrLot?: Record<string, unknown> | null;
}) {
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'vinted_post_jobs') {
      return {
        select: vi.fn((_cols: string, selectOpts?: { count?: string; head?: boolean }) => {
          if (selectOpts?.head) {
            // pending count query: .select('id', { count: 'exact', head: true }).eq(...).eq(...)
            // — the second .eq() call is the one that resolves, matching the
            // real two-.eq() chain in the implementation.
            return {
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ count: opts.pendingCount }),
              })),
            };
          }
          // processing-job query: .select(...).eq(...).eq(...).order(...).limit(...).maybeSingle()
          return {
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: opts.processingJob }),
          };
        }),
      };
    }
    if (table === 'cards' || table === 'lots') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: opts.cardOrLot ?? null }),
      };
    }
    return {};
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useActiveJob', () => {
  it('returns no active job when nothing is processing or pending', async () => {
    mockChannel();
    mockJobsTable({ processingJob: null, pendingCount: 0 });
    const { result } = renderHook(() => useActiveJob('user-1'));
    await waitFor(() => expect(result.current.activeJob).toBeNull());
    expect(result.current.pendingCount).toBe(0);
  });

  it('reports the pending count when nothing is processing', async () => {
    mockChannel();
    mockJobsTable({ processingJob: null, pendingCount: 3 });
    const { result } = renderHook(() => useActiveJob('user-1'));
    await waitFor(() => expect(result.current.pendingCount).toBe(3));
    expect(result.current.activeJob).toBeNull();
  });

  it('resolves the active job to a card name/image when card_id is set', async () => {
    mockChannel();
    mockJobsTable({
      processingJob: { card_id: 'c1', lot_id: null, job_type: 'post', created_at: '2026-09-23T10:00:00Z' },
      pendingCount: 0,
      cardOrLot: { card_name: 'Pharamp GX', image_url: 'a.png', tcg_image_url: null, pokemon_number: 149 },
    });
    const { result } = renderHook(() => useActiveJob('user-1'));
    await waitFor(() => expect(result.current.activeJob).not.toBeNull());
    expect(result.current.activeJob).toEqual({
      cardId: 'c1',
      lotId: null,
      jobType: 'post',
      itemName: 'Pharamp GX',
      itemImage: 'a.png',
      startedAt: '2026-09-23T10:00:00Z',
    });
  });

  it('resolves the active job to a lot name/image when lot_id is set', async () => {
    mockChannel();
    mockJobsTable({
      processingJob: { card_id: null, lot_id: 'l1', job_type: 'repost', created_at: '2026-09-23T10:05:00Z' },
      pendingCount: 0,
      cardOrLot: { name: 'Lot Riftbound', photo_urls: ['l1/0.jpg'] },
    });
    const { result } = renderHook(() => useActiveJob('user-1'));
    await waitFor(() => expect(result.current.activeJob).not.toBeNull());
    expect(result.current.activeJob?.itemName).toBe('Lot Riftbound');
    expect(result.current.activeJob?.itemImage).toBe(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/lot-photos/l1/0.jpg`,
    );
  });

  it('subscribes to Realtime changes on vinted_post_jobs scoped to the given user', () => {
    const channel = mockChannel();
    mockJobsTable({ processingJob: null, pendingCount: 0 });
    renderHook(() => useActiveJob('user-1'));
    expect(supabaseMock.channel).toHaveBeenCalledWith('vinted-post-jobs-user-1');
    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ table: 'vinted_post_jobs', filter: 'user_id=eq.user-1' }),
      expect.any(Function),
    );
  });
});
