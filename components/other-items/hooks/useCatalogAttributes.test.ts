import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { POLL_INTERVAL_MS, WAITING_BOT_AFTER_MS, useCatalogAttributes } from './useCatalogAttributes';

type Row = Record<string, unknown>;

/** In-memory stand-in for the vinted_catalog_attributes table. */
const db = vi.hoisted(() => ({
  rows: new Map<number, Record<string, unknown>>(),
  inserts: [] as Record<string, unknown>[],
  updates: [] as { payload: Record<string, unknown>; catalogId: unknown }[],
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'fred-id' } } }) },
    from: () => ({
      select: () => ({
        eq: (_column: string, catalogId: number) => ({
          maybeSingle: async () => ({ data: db.rows.get(catalogId) ?? null }),
        }),
      }),
      insert: async (payload: Record<string, unknown>) => {
        db.inserts.push(payload);
        db.rows.set(payload.catalog_id as number, { status: 'pending', ...payload });
        return { error: null };
      },
      update: (payload: Record<string, unknown>) => ({
        eq: async (_column: string, catalogId: number) => {
          db.updates.push({ payload, catalogId });
          db.rows.set(catalogId, { ...db.rows.get(catalogId), ...payload });
          return { error: null };
        },
      }),
    }),
  }),
}));

const READY_PUFFER: Row = {
  catalog_id: 2614,
  status: 'ready',
  size_options: [{ title: 'S/M/L', options: [{ id: 1740, title: 'L' }] }],
  size_required: true,
  condition_options: [{ id: 2, title: 'Très bon état' }],
  has_color: true,
  error: null,
};

beforeEach(() => {
  vi.useFakeTimers();
  db.rows.clear();
  db.inserts.length = 0;
  db.updates.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useCatalogAttributes', () => {
  it('stays idle without a category', async () => {
    const { result } = renderHook(() => useCatalogAttributes(null));
    await flush();
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(db.inserts).toEqual([]);
  });

  it('serves a cached category straight away, without asking the bot', async () => {
    db.rows.set(2614, READY_PUFFER);
    const { result } = renderHook(() => useCatalogAttributes(2614));
    await flush();
    expect(result.current.state).toEqual({ status: 'ready', attributes: READY_PUFFER });
    expect(db.inserts).toEqual([]);
  });

  it('asks the bot for an unknown category, then picks up its answer', async () => {
    const { result } = renderHook(() => useCatalogAttributes(2614));
    await flush();
    expect(db.inserts).toEqual([{ catalog_id: 2614 }]);
    expect(result.current.state).toEqual({ status: 'loading' });

    db.rows.set(2614, READY_PUFFER); // the bot filled the row
    await flush(POLL_INTERVAL_MS);
    expect(result.current.state).toEqual({ status: 'ready', attributes: READY_PUFFER });
  });

  it('says it is waiting for the bot when nothing comes back for a while', async () => {
    const { result } = renderHook(() => useCatalogAttributes(2614));
    await flush(WAITING_BOT_AFTER_MS + POLL_INTERVAL_MS);
    expect(result.current.state).toEqual({ status: 'waiting_bot' });
  });

  it("surfaces the bot's error, and retry() asks again on the user's behalf", async () => {
    db.rows.set(2614, { catalog_id: 2614, status: 'error', error: 'HTTP Error 403: ' });
    const { result } = renderHook(() => useCatalogAttributes(2614));
    await flush();
    expect(result.current.state).toEqual({ status: 'error', message: 'HTTP Error 403: ' });

    await act(async () => {
      await result.current.retry();
    });
    expect(db.updates[0].catalogId).toBe(2614);
    expect(db.updates[0].payload).toMatchObject({ status: 'pending', error: null, requested_by: 'fred-id' });

    db.rows.set(2614, READY_PUFFER);
    await flush(POLL_INTERVAL_MS);
    expect(result.current.state).toEqual({ status: 'ready', attributes: READY_PUFFER });
  });

  it('switches to the new category when it changes', async () => {
    db.rows.set(2614, READY_PUFFER);
    db.rows.set(145, { ...READY_PUFFER, catalog_id: 145, size_options: null });
    const { result, rerender } = renderHook(({ id }) => useCatalogAttributes(id), { initialProps: { id: 2614 } });
    await flush();
    rerender({ id: 145 });
    await flush();
    expect(result.current.state).toMatchObject({ status: 'ready', attributes: { catalog_id: 145 } });
  });
});
