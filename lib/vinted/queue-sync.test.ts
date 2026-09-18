// lib/vinted/queue-sync.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncVintedQueueMembership } from './queue-sync';

const USER_A = '35385d3c-5966-4a10-8568-8d92d1be47e7';
const USER_B = 'a018a4ef-e02e-4a67-9732-9fafe3167e10';

// vitest doesn't auto-load .env.local, unlike the Next.js app at runtime —
// set the same env var the implementation reads, mirroring the pattern in
// app/api/vinted/bump-job/route.test.ts and post-job/route.test.ts.
beforeEach(() => {
  process.env.VINTED_USER_IDS = `${USER_A},${USER_B}`;
});
afterEach(() => {
  delete process.env.VINTED_USER_IDS;
});

function makeSupabaseMock({
  card,
  activeListingUserIds = [],
  existingQueueUserIds = [],
  maxPosition = 0,
}: {
  card: { status: string; price_confirmed_at: string | null };
  activeListingUserIds?: string[];
  existingQueueUserIds?: string[];
  maxPosition?: number;
}) {
  const inserted: unknown[] = [];
  const deleted: unknown[] = [];

  const from = vi.fn((table: string) => {
    if (table === 'cards') {
      return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: card, error: null }) }) }) };
    }
    if (table === 'card_listings') {
      return {
        select: () => ({
          eq: () => ({
            not: () =>
              Promise.resolve({
                data: activeListingUserIds.map((user_id) => ({ user_id })),
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === 'vinted_queue') {
      return {
        select: (cols: string) => ({
          eq: (col: string, val: string) => {
            if (col === 'card_id') {
              return Promise.resolve({
                data: existingQueueUserIds.map((user_id) => ({ user_id })),
                error: null,
              });
            }
            // .eq('user_id', ...).order(...).limit(1) — max-position lookup
            return {
              order: () => ({
                limit: () => Promise.resolve({ data: maxPosition ? [{ position: maxPosition }] : [], error: null }),
              }),
            };
          },
        }),
        insert: (row: unknown) => {
          inserted.push(row);
          return Promise.resolve({ error: null });
        },
        delete: () => ({
          eq: () => ({ eq: () => {
            deleted.push({});
            return Promise.resolve({ error: null });
          } }),
        }),
      };
    }
    throw new Error(`unmocked table: ${table}`);
  });

  return { from, inserted, deleted };
}

describe('syncVintedQueueMembership', () => {
  it('adds the card to both enabled users’ queues when neither has listed it yet', async () => {
    const supabase = makeSupabaseMock({
      card: { status: 'for_sale', price_confirmed_at: '2026-09-18T10:00:00.000Z' },
      activeListingUserIds: [],
      existingQueueUserIds: [],
      maxPosition: 2,
    });

    await syncVintedQueueMembership(supabase as never, 'card-1');

    expect(supabase.inserted).toHaveLength(2);
    expect(supabase.inserted).toContainEqual(
      expect.objectContaining({ user_id: USER_A, card_id: 'card-1', position: 3 }),
    );
    expect(supabase.inserted).toContainEqual(
      expect.objectContaining({ user_id: USER_B, card_id: 'card-1', position: 3 }),
    );
  });

  it('skips a user who already has an active Vinted listing for this card', async () => {
    const supabase = makeSupabaseMock({
      card: { status: 'for_sale', price_confirmed_at: '2026-09-18T10:00:00.000Z' },
      activeListingUserIds: [USER_A],
      existingQueueUserIds: [],
    });

    await syncVintedQueueMembership(supabase as never, 'card-1');

    expect(supabase.inserted).toHaveLength(1);
    expect(supabase.inserted[0]).toMatchObject({ user_id: USER_B });
  });

  it('removes existing queue entries when the card is no longer eligible', async () => {
    const supabase = makeSupabaseMock({
      card: { status: 'sold', price_confirmed_at: '2026-09-18T10:00:00.000Z' },
      existingQueueUserIds: [USER_A, USER_B],
    });

    await syncVintedQueueMembership(supabase as never, 'card-1');

    expect(supabase.inserted).toHaveLength(0);
    expect(supabase.deleted).toHaveLength(2);
  });

  it('does not insert a duplicate queue entry for a user who already has one', async () => {
    const supabase = makeSupabaseMock({
      card: { status: 'for_sale', price_confirmed_at: '2026-09-18T10:00:00.000Z' },
      existingQueueUserIds: [USER_A],
    });

    await syncVintedQueueMembership(supabase as never, 'card-1');

    expect(supabase.inserted).toHaveLength(1);
    expect(supabase.inserted[0]).toMatchObject({ user_id: USER_B });
  });
});
