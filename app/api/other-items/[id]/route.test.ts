import { afterEach, describe, expect, it, vi } from 'vitest';
import { DELETE, PATCH } from './route';

const FRED_USER_ID = '35385d3c-5966-4a10-8568-8d92d1be47e7';

const supabaseMock = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
  storage: { from: vi.fn() },
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(supabaseMock),
}));
vi.mock('@/lib/utils/audit-log', () => ({ auditLog: vi.fn() }));
const queueSync = vi.hoisted(() => ({ clearOtherItemQueueFailure: vi.fn() }));
vi.mock('@/lib/vinted/other-item-queue-sync', () => ({
  FRED_USER_ID: '35385d3c-5966-4a10-8568-8d92d1be47e7',
  syncOtherItemQueueMembership: vi.fn(),
  clearOtherItemQueueFailure: queueSync.clearOtherItemQueueFailure,
}));

afterEach(() => {
  vi.clearAllMocks();
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function patchRequest(body: unknown): Request {
  return new Request('http://localhost/api/other-items/abc', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function deleteRequest(): Request {
  return new Request('http://localhost/api/other-items/abc', { method: 'DELETE' });
}

describe('PATCH /api/other-items/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await PATCH(patchRequest({ price: 30 }), ctx('abc'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when authenticated as someone other than Fred', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'someone-else' } } });
    const res = await PATCH(patchRequest({ price: 30 }), ctx('abc'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when the item does not exist', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: FRED_USER_ID } } });
    const updateSingle = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({ select: vi.fn(() => ({ single: updateSingle })) })),
    }));
    supabaseMock.from.mockReturnValue({ update });
    const res = await PATCH(patchRequest({ price: 30 }), ctx('abc'));
    expect(res.status).toBe(404);
  });

  it('updates the price and returns the updated item', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: FRED_USER_ID } } });
    const updateSingle = vi.fn().mockResolvedValue({
      data: { id: 'abc', price: 30, name: 'Item', status: 'for_sale' },
      error: null,
    });
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({ select: vi.fn(() => ({ single: updateSingle })) })),
    }));
    supabaseMock.from.mockReturnValue({ update });
    const res = await PATCH(patchRequest({ price: 30 }), ctx('abc'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.item.price).toBe(30);
  });

  it('accepts the collection status (move to stock)', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: FRED_USER_ID } } });
    const updateSingle = vi.fn().mockResolvedValue({ data: { id: 'abc', status: 'collection' }, error: null });
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({ select: vi.fn(() => ({ single: updateSingle })) })),
    }));
    supabaseMock.from.mockReturnValue({ update });
    const res = await PATCH(patchRequest({ status: 'collection' }), ctx('abc'));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'collection' }));
  });

  it('rejects an invalid status', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: FRED_USER_ID } } });
    const res = await PATCH(patchRequest({ status: 'archived' }), ctx('abc'));
    expect(res.status).toBe(400);
  });

  it('rejects a negative price', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: FRED_USER_ID } } });
    const res = await PATCH(patchRequest({ price: -5 }), ctx('abc'));
    expect(res.status).toBe(400);
  });

  it('rejects an empty body', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: FRED_USER_ID } } });
    const res = await PATCH(patchRequest({}), ctx('abc'));
    expect(res.status).toBe(400);
  });

  function mockSuccessfulUpdate() {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: FRED_USER_ID } } });
    const updateSingle = vi.fn().mockResolvedValue({ data: { id: 'abc', name: 'Item', status: 'for_sale' }, error: null });
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({ select: vi.fn(() => ({ single: updateSingle })) })),
    }));
    supabaseMock.from.mockReturnValue({ update });
    return update;
  }

  it('updates the Vinted attributes: condition, size option + label, colors', async () => {
    const update = mockSuccessfulUpdate();
    const res = await PATCH(
      patchRequest({ vinted_condition_id: 6, vinted_size_id: 1740, size: 'L', vinted_color_ids: [1, 3] }),
      ctx('abc'),
    );
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ vinted_condition_id: 6, vinted_size_id: 1740, size: 'L', vinted_color_ids: [1, 3] });
  });

  it('can clear the size', async () => {
    const update = mockSuccessfulUpdate();
    const res = await PATCH(patchRequest({ vinted_size_id: null, size: null }), ctx('abc'));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ vinted_size_id: null, size: null });
  });

  it('rejects an invalid condition, size or color list', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: FRED_USER_ID } } });
    expect((await PATCH(patchRequest({ vinted_condition_id: 0 }), ctx('abc'))).status).toBe(400);
    expect((await PATCH(patchRequest({ vinted_condition_id: 'neuf' }), ctx('abc'))).status).toBe(400);
    expect((await PATCH(patchRequest({ vinted_size_id: -3 }), ctx('abc'))).status).toBe(400);
    expect((await PATCH(patchRequest({ vinted_color_ids: [1, 3, 12] }), ctx('abc'))).status).toBe(400);
    expect((await PATCH(patchRequest({ vinted_color_ids: [99] }), ctx('abc'))).status).toBe(400);
  });

  it("hands a fixed item back to the scheduler by clearing its queue row's failure flag", async () => {
    mockSuccessfulUpdate();
    await PATCH(patchRequest({ vinted_size_id: 1740, size: 'L' }), ctx('abc'));
    expect(queueSync.clearOtherItemQueueFailure).toHaveBeenCalledWith(supabaseMock, 'abc');
  });

  it('does not touch the queue when the update failed', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: FRED_USER_ID } } });
    const updateSingle = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
    const update = vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(() => ({ single: updateSingle })) })) }));
    supabaseMock.from.mockReturnValue({ update });
    await PATCH(patchRequest({ price: 30 }), ctx('abc'));
    expect(queueSync.clearOtherItemQueueFailure).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/other-items/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await DELETE(deleteRequest(), ctx('abc'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when authenticated as someone other than Fred', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'someone-else' } } });
    const res = await DELETE(deleteRequest(), ctx('abc'));
    expect(res.status).toBe(403);
  });
});
