import { describe, expect, it, vi } from 'vitest';
import { enqueueCrossUserDeleteJobs } from './cross-user-sync';

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
