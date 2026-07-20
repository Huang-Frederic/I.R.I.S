import { afterEach, describe, expect, it, vi } from 'vitest';
import { DELETE, PATCH } from './route';

const supabaseMock = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
  storage: { from: vi.fn() },
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(supabaseMock),
}));

afterEach(() => {
  vi.clearAllMocks();
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function patchRequest(body: unknown): Request {
  return new Request('http://localhost/api/lots/abc', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function deleteRequest(): Request {
  return new Request('http://localhost/api/lots/abc', { method: 'DELETE' });
}

describe('PATCH /api/lots/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await PATCH(patchRequest({ price: 30 }), ctx('abc'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when the lot does not exist', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const updateSingle = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({ select: vi.fn(() => ({ single: updateSingle })) })),
    }));
    supabaseMock.from.mockReturnValue({ update });
    const res = await PATCH(patchRequest({ price: 30 }), ctx('abc'));
    expect(res.status).toBe(404);
  });

  it('updates the price and returns the updated lot', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const updateSingle = vi.fn().mockResolvedValue({
      data: { id: 'abc', price: 30, name: 'Lot', status: 'for_sale' },
      error: null,
    });
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({ select: vi.fn(() => ({ single: updateSingle })) })),
    }));
    supabaseMock.from.mockReturnValue({ update });
    const res = await PATCH(patchRequest({ price: 30 }), ctx('abc'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.lot.price).toBe(30);
  });

  /** Mock the pre-fetch the sold path does to read the current quantity. */
  function mockCurrentLot(lot: Record<string, unknown>) {
    const maybeSingle = vi.fn().mockResolvedValue({ data: lot, error: null });
    const select = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) }));
    return { select };
  }

  it('auto-sets date_sold when status flips to sold and no date provided', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const updateSingle = vi.fn().mockResolvedValue({
      data: { id: 'abc', status: 'sold', date_sold: '2026-05-02T00:00:00Z' },
      error: null,
    });
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({ select: vi.fn(() => ({ single: updateSingle })) })),
    }));
    supabaseMock.from
      .mockReturnValueOnce(mockCurrentLot({ id: 'abc', quantity: 1 }))
      .mockReturnValueOnce({ update });
    const res = await PATCH(patchRequest({ status: 'sold' }), ctx('abc'));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sold', date_sold: expect.any(String) }),
    );
  });

  it('preserves explicit date_sold when status flips to sold (explicit > auto)', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const explicitDate = '2026-01-01T00:00:00Z';
    const updateSingle = vi.fn().mockResolvedValue({
      data: { id: 'abc', status: 'sold', date_sold: explicitDate },
      error: null,
    });
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({ select: vi.fn(() => ({ single: updateSingle })) })),
    }));
    supabaseMock.from
      .mockReturnValueOnce(mockCurrentLot({ id: 'abc', quantity: 1 }))
      .mockReturnValueOnce({ update });
    const res = await PATCH(patchRequest({ status: 'sold', date_sold: explicitDate }), ctx('abc'));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sold', date_sold: explicitDate }),
    );
  });

  it('splits a quantity>1 lot on sold: inserts a sold clone, decrements the original', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const current = {
      id: 'abc', name: 'Lot 50 communes', language: 'FR', condition: 'NM',
      extra_description: null, price: 12, status: 'for_sale', quantity: 3,
      photo_url: null, photo_urls: ['abc/0.jpg'], date_added: '2026-06-01T00:00:00Z',
      catalog_id: 4879, brand_id: 191646, brand_name: 'Pokémon', brand_label: 'Pokémon', is_lot: true,
    };
    const soldClone = { ...current, id: 'clone', status: 'sold', quantity: 1, sold_price: 12, sold_by_user_id: 'u' };
    const remaining = { ...current, quantity: 2 };

    const insertSingle = vi.fn().mockResolvedValue({ data: soldClone, error: null });
    const insert = vi.fn((_payload: Record<string, unknown>) => ({ select: vi.fn(() => ({ single: insertSingle })) }));
    const decSingle = vi.fn().mockResolvedValue({ data: remaining, error: null });
    const update = vi.fn((_payload: Record<string, unknown>) => ({
      eq: vi.fn(() => ({ select: vi.fn(() => ({ single: decSingle })) })),
    }));

    supabaseMock.from
      .mockReturnValueOnce(mockCurrentLot(current))   // pre-fetch
      .mockReturnValueOnce({ insert })                // sold clone
      .mockReturnValueOnce({ update });               // decrement

    const res = await PATCH(patchRequest({ status: 'sold', sold_price: 12 }), ctx('abc'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.split).toBe(true);
    expect(json.lot.quantity).toBe(2);
    expect(json.soldLot.status).toBe('sold');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sold', quantity: 1, sold_price: 12, sold_by_user_id: 'u' }),
    );
    expect(update).toHaveBeenCalledWith({ quantity: 2 });
  });

  it('accepts the collection status (move to Stock)', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const updateSingle = vi.fn().mockResolvedValue({
      data: { id: 'abc', status: 'collection' },
      error: null,
    });
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({ select: vi.fn(() => ({ single: updateSingle })) })),
    }));
    supabaseMock.from.mockReturnValue({ update });
    const res = await PATCH(patchRequest({ status: 'collection' }), ctx('abc'));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'collection' }));
    // Moving to stock must not stamp sale fields.
    expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ sold_by_user_id: 'u' }));
  });

  it('rejects an invalid status', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const res = await PATCH(patchRequest({ status: 'archived' }), ctx('abc'));
    expect(res.status).toBe(400);
  });

  it('rejects a non-integer or <1 quantity', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    expect((await PATCH(patchRequest({ quantity: 0 }), ctx('abc'))).status).toBe(400);
    expect((await PATCH(patchRequest({ quantity: 2.5 }), ctx('abc'))).status).toBe(400);
  });
});

describe('DELETE /api/lots/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await DELETE(deleteRequest(), ctx('abc'));
    expect(res.status).toBe(401);
  });

  // Adding a happy-path delete test is optional — the read-then-delete-then-storage chain
  // is mostly Supabase plumbing and doesn't change behavior. Smoke test will cover the full flow.
});
