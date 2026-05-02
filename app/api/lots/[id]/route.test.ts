// app/api/lots/[id]/route.test.ts
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

  it('auto-sets date_sold when status flips to sold and no date provided', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const updateSingle = vi.fn().mockResolvedValue({
      data: { id: 'abc', status: 'sold', date_sold: '2026-05-02T00:00:00Z' },
      error: null,
    });
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({ select: vi.fn(() => ({ single: updateSingle })) })),
    }));
    supabaseMock.from.mockReturnValue({ update });
    const res = await PATCH(patchRequest({ status: 'sold' }), ctx('abc'));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sold', date_sold: expect.any(String) }),
    );
  });

  it('rejects an invalid status', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const res = await PATCH(patchRequest({ status: 'collection' }), ctx('abc'));
    expect(res.status).toBe(400);
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
