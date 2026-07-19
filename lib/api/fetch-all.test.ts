import { describe, expect, it, vi } from 'vitest';
import { fetchAllRows, chunkArray } from './fetch-all';

/** Build a page() stub backed by a fixed dataset of `total` numbered rows. */
function pagedSource(total: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ i }));
  return vi.fn((from: number, to: number) =>
    Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
  );
}

describe('fetchAllRows', () => {
  it('returns a single short page in one request', async () => {
    const page = pagedSource(42);
    const { data, error } = await fetchAllRows(page);
    expect(error).toBeNull();
    expect(data).toHaveLength(42);
    expect(page).toHaveBeenCalledTimes(1);
    expect(page).toHaveBeenCalledWith(0, 999);
  });

  it('concatenates full pages until a short page signals the end', async () => {
    const page = pagedSource(2005);
    const { data } = await fetchAllRows(page);
    expect(data).toHaveLength(2005);
    expect(data![0]).toEqual({ i: 0 });
    expect(data![2004]).toEqual({ i: 2004 });
    expect(page).toHaveBeenCalledTimes(3);
    expect(page).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(page).toHaveBeenNthCalledWith(3, 2000, 2999);
  });

  it('needs one extra empty request when the total is an exact multiple of the page size', async () => {
    const page = pagedSource(1000);
    const { data } = await fetchAllRows(page);
    expect(data).toHaveLength(1000);
    expect(page).toHaveBeenCalledTimes(2);
  });

  it('propagates an error and returns data: null (supabase semantics)', async () => {
    const boom = { message: 'boom' } as never;
    const page = vi.fn((from: number) =>
      Promise.resolve(
        from === 0
          ? { data: Array.from({ length: 1000 }, (_, i) => ({ i })), error: null }
          : { data: null, error: boom },
      ),
    );
    const { data, error } = await fetchAllRows(page);
    expect(data).toBeNull();
    expect(error).toBe(boom);
  });

  it('treats data: null with no error as an empty result', async () => {
    const page = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const { data, error } = await fetchAllRows(page);
    expect(data).toEqual([]);
    expect(error).toBeNull();
  });
});

describe('chunkArray', () => {
  it('splits into chunks of the given size, last one short', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns a single chunk when under the size', () => {
    expect(chunkArray([1, 2], 10)).toEqual([[1, 2]]);
  });

  it('returns no chunks for an empty list', () => {
    expect(chunkArray([], 10)).toEqual([]);
  });
});
