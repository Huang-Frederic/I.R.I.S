import { describe, expect, it, vi } from 'vitest';
import { enqueueCrossUserDeleteJobs, enqueueLotCrossUserDeleteJobs } from './cross-user-sync';

describe('enqueueCrossUserDeleteJobs', () => {
  it('enqueues a delete job for a sibling active listing by a different user', async () => {
    const inserted: unknown[] = [];
    const supabase = {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            neq: () => ({
              not: () =>
                Promise.resolve({
                  data: [{ user_id: 'other-user', vinted_listing_id: 'v123' }],
                  error: null,
                }),
            }),
          }),
        }),
        insert: (row: unknown) => {
          inserted.push(row);
          return Promise.resolve({ error: null });
        },
      })),
    };

    await enqueueCrossUserDeleteJobs(supabase as never, 'card-1', 'selling-user');

    expect(inserted).toEqual([
      expect.objectContaining({
        card_id: 'card-1',
        user_id: 'other-user',
        job_type: 'delete',
        status: 'pending',
      }),
    ]);
  });

  it('does nothing when no other user has an active listing for this card', async () => {
    const inserted: unknown[] = [];
    const supabase = {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({ neq: () => ({ not: () => Promise.resolve({ data: [], error: null }) }) }),
        }),
        insert: (row: unknown) => {
          inserted.push(row);
          return Promise.resolve({ error: null });
        },
      })),
    };

    await enqueueCrossUserDeleteJobs(supabase as never, 'card-1', 'selling-user');

    expect(inserted).toHaveLength(0);
  });
});

describe('enqueueLotCrossUserDeleteJobs', () => {
  function makeSupabase(siblings: Array<{ user_id: string; vinted_listing_id: string }>) {
    const inserted: unknown[] = [];
    const tables: string[] = [];
    const supabase = {
      from: vi.fn((table: string) => {
        tables.push(table);
        return {
          select: () => ({
            eq: () => ({ neq: () => ({ not: () => Promise.resolve({ data: siblings, error: null }) }) }),
          }),
          insert: (row: unknown) => {
            inserted.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }),
    };
    return { supabase, inserted, tables };
  }

  it('enqueues a delete job for the other account’s live listing of a sold lot', async () => {
    const { supabase, inserted, tables } = makeSupabase([{ user_id: 'other-user', vinted_listing_id: 'v9' }]);

    await enqueueLotCrossUserDeleteJobs(supabase as never, 'lot-1', 'selling-user');

    expect(tables[0]).toBe('lot_listings');
    expect(inserted).toEqual([{ lot_id: 'lot-1', user_id: 'other-user', job_type: 'delete', status: 'pending' }]);
  });

  it('does nothing when no other account has the lot online', async () => {
    const { supabase, inserted } = makeSupabase([]);

    await enqueueLotCrossUserDeleteJobs(supabase as never, 'lot-1', 'selling-user');

    expect(inserted).toHaveLength(0);
  });
});
