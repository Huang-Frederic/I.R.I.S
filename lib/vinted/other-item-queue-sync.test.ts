// lib/vinted/other-item-queue-sync.test.ts
import { describe, expect, it, vi } from 'vitest';
import { clearOtherItemQueueFailure, syncOtherItemQueueMembership, FRED_USER_ID } from './other-item-queue-sync';

function mockSupabase(overrides: Record<string, unknown> = {}) {
  const calls: { table: string; op: string; payload?: unknown }[] = [];
  const base = {
    other_items: { status: 'for_sale', price: 25 },
    activeListing: null,
    existingQueueRow: null,
    maxPosition: null,
    ...overrides,
  };
  const supabase = {
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: base.other_items }),
            maybeSingle: async () => {
              if (table === 'other_item_listings') return { data: base.activeListing };
              if (table === 'vinted_queue') return { data: base.existingQueueRow };
              return { data: null };
            },
            eq: () => ({
              maybeSingle: async () => ({ data: table === 'vinted_queue' ? base.existingQueueRow : base.activeListing }),
              order: () => ({ limit: async () => ({ data: base.maxPosition ? [{ position: base.maxPosition }] : [] }) }),
            }),
            order: () => ({ limit: async () => ({ data: base.maxPosition ? [{ position: base.maxPosition }] : [] }) }),
          }),
        }),
        insert: async (payload: unknown) => { calls.push({ table, op: 'insert', payload }); return { error: null }; },
        delete: () => ({
          eq: () => ({ eq: async () => { calls.push({ table, op: 'delete' }); return { error: null }; } }),
        }),
      };
      // eslint-disable-next-line no-unreachable
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: supabase as any, calls };
}

describe('syncOtherItemQueueMembership', () => {
  it('queues a for_sale item with no existing listing and no existing queue row', async () => {
    const { supabase, calls } = mockSupabase({ other_items: { status: 'for_sale', price: 25 }, activeListing: null, existingQueueRow: null });
    await syncOtherItemQueueMembership(supabase, 'item-1');
    const insert = calls.find((c) => c.table === 'vinted_queue' && c.op === 'insert');
    expect(insert?.payload).toMatchObject({ user_id: FRED_USER_ID, other_item_id: 'item-1' });
  });

  it('does not queue an item already actively listed on Vinted', async () => {
    const { supabase, calls } = mockSupabase({ activeListing: { vinted_listing_id: '123' } });
    await syncOtherItemQueueMembership(supabase, 'item-1');
    expect(calls.find((c) => c.table === 'vinted_queue' && c.op === 'insert')).toBeUndefined();
  });

  it('does not queue a for_sale item that has no price yet — the bot would have nothing to post it at', async () => {
    const { supabase, calls } = mockSupabase({ other_items: { status: 'for_sale', price: null } });
    await syncOtherItemQueueMembership(supabase, 'item-1');
    expect(calls.find((c) => c.table === 'vinted_queue' && c.op === 'insert')).toBeUndefined();
  });

  it('removes a queued item whose price was cleared', async () => {
    const { supabase, calls } = mockSupabase({ other_items: { status: 'for_sale', price: null }, existingQueueRow: { id: 'q1' } });
    await syncOtherItemQueueMembership(supabase, 'item-1');
    expect(calls.find((c) => c.table === 'vinted_queue' && c.op === 'delete')).toBeTruthy();
  });

  it('removes a queued item that moved to status=collection', async () => {
    const { supabase, calls } = mockSupabase({ other_items: { status: 'collection' }, existingQueueRow: { id: 'q1' } });
    await syncOtherItemQueueMembership(supabase, 'item-1');
    expect(calls.find((c) => c.table === 'vinted_queue' && c.op === 'delete')).toBeTruthy();
  });
});

describe('clearOtherItemQueueFailure', () => {
  it("clears the failure flag on Fred's queue row for that item", async () => {
    const eqCalls: [string, unknown][] = [];
    const update = vi.fn(() => {
      const chain = {
        eq: (column: string, value: unknown) => {
          eqCalls.push([column, value]);
          return eqCalls.length === 2 ? Promise.resolve({ error: null }) : chain;
        },
      };
      return chain;
    });
    const supabase = { from: vi.fn(() => ({ update })) };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await clearOtherItemQueueFailure(supabase as any, 'item-1');

    expect(supabase.from).toHaveBeenCalledWith('vinted_queue');
    expect(update).toHaveBeenCalledWith({ last_error: null, failed_at: null });
    expect(eqCalls).toEqual([['user_id', FRED_USER_ID], ['other_item_id', 'item-1']]);
  });
});
