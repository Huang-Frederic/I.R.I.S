// lib/vinted/lot-queue-sync.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isLotEligibleForQueue, syncLotQueueMembership } from './lot-queue-sync';

const USER_A = '35385d3c-5966-4a10-8568-8d92d1be47e7';
const USER_B = 'a018a4ef-e02e-4a67-9732-9fafe3167e10';

beforeEach(() => {
  process.env.VINTED_USER_IDS = `${USER_A},${USER_B}`;
});
afterEach(() => {
  delete process.env.VINTED_USER_IDS;
});

function makeSupabaseMock({
  lot,
  activeListingUserIds = [],
  existingQueueUserIds = [],
  maxPosition = 0,
}: {
  lot: { status: string; price: number | null };
  activeListingUserIds?: string[];
  existingQueueUserIds?: string[];
  maxPosition?: number;
}) {
  const inserted: unknown[] = [];
  const deleted: string[] = [];

  const from = vi.fn((table: string) => {
    if (table === 'lots') {
      return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: lot, error: null }) }) }) };
    }
    if (table === 'lot_listings') {
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
        select: () => ({
          eq: (col: string) => {
            if (col === 'lot_id') {
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
          eq: (_col: string, userId: string) => ({
            eq: () => {
              deleted.push(userId);
              return Promise.resolve({ error: null });
            },
          }),
        }),
      };
    }
    throw new Error(`unmocked table: ${table}`);
  });

  return { from, inserted, deleted };
}

describe('isLotEligibleForQueue', () => {
  it('accepts a lot for sale with a price', () => {
    expect(isLotEligibleForQueue({ status: 'for_sale', price: 4.4 })).toBe(true);
  });

  it('rejects a lot without a price — the bot has nothing to post it at', () => {
    expect(isLotEligibleForQueue({ status: 'for_sale', price: null })).toBe(false);
    expect(isLotEligibleForQueue({ status: 'for_sale', price: 0 })).toBe(false);
  });

  it('rejects a lot that is not for sale', () => {
    expect(isLotEligibleForQueue({ status: 'collection', price: 4.4 })).toBe(false);
    expect(isLotEligibleForQueue({ status: 'sold', price: 4.4 })).toBe(false);
  });
});

describe('syncLotQueueMembership', () => {
  it('adds the lot to every enabled account’s queue when nobody has listed it yet', async () => {
    const supabase = makeSupabaseMock({ lot: { status: 'for_sale', price: 8.2 }, maxPosition: 4 });

    await syncLotQueueMembership(supabase as never, 'lot-1');

    expect(supabase.inserted).toHaveLength(2);
    expect(supabase.inserted).toContainEqual({ user_id: USER_A, lot_id: 'lot-1', position: 5 });
    expect(supabase.inserted).toContainEqual({ user_id: USER_B, lot_id: 'lot-1', position: 5 });
  });

  it('skips an account that already has the lot online', async () => {
    const supabase = makeSupabaseMock({ lot: { status: 'for_sale', price: 8.2 }, activeListingUserIds: [USER_A] });

    await syncLotQueueMembership(supabase as never, 'lot-1');

    expect(supabase.inserted).toEqual([expect.objectContaining({ user_id: USER_B })]);
  });

  it('does not queue a lot that has no price yet', async () => {
    const supabase = makeSupabaseMock({ lot: { status: 'for_sale', price: null } });

    await syncLotQueueMembership(supabase as never, 'lot-1');

    expect(supabase.inserted).toHaveLength(0);
  });

  it('removes the queue entries of a lot that is sold or back in the collection', async () => {
    const supabase = makeSupabaseMock({ lot: { status: 'sold', price: 8.2 }, existingQueueUserIds: [USER_A, USER_B] });

    await syncLotQueueMembership(supabase as never, 'lot-1');

    expect(supabase.inserted).toHaveLength(0);
    expect(supabase.deleted.sort()).toEqual([USER_A, USER_B].sort());
  });

  it('does not insert a duplicate for an account that already has the lot queued', async () => {
    const supabase = makeSupabaseMock({ lot: { status: 'for_sale', price: 8.2 }, existingQueueUserIds: [USER_A] });

    await syncLotQueueMembership(supabase as never, 'lot-1');

    expect(supabase.inserted).toEqual([expect.objectContaining({ user_id: USER_B })]);
  });

  it('queues the seller again when one copy of a multi-copy lot sold — that ad was consumed by the sale', async () => {
    const supabase = makeSupabaseMock({
      lot: { status: 'for_sale', price: 8.2 },
      activeListingUserIds: [USER_A, USER_B],
    });

    await syncLotQueueMembership(supabase as never, 'lot-1', { consumedListingUserId: USER_A });

    expect(supabase.inserted).toEqual([expect.objectContaining({ user_id: USER_A, lot_id: 'lot-1' })]);
  });
});
