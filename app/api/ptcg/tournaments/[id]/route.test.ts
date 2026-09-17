import { afterEach, describe, expect, it, vi } from 'vitest';

const supabaseMock = { auth: { getUser: vi.fn() }, from: vi.fn() };
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(supabaseMock),
}));

import { PATCH } from './route';

function makeRequest(body?: unknown): Request {
  return new Request('http://localhost/api/ptcg/tournaments/t1', {
    method: 'PATCH',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const ctx = { params: Promise.resolve({ id: 't1' }) };

const validBody = {
  name: 'Meisia Cup',
  playedAt: '2026-09-12',
  category: 'challenge',
  bestOf: 3,
  placement: 'top_32',
  myArchetypeDex: [157, 156],
};

describe('PATCH /api/ptcg/tournaments/[id]', () => {
  afterEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await PATCH(makeRequest(validBody), ctx);
    expect(res.status).toBe(401);
  });

  it('rejects an invalid body the same way POST does', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const res = await PATCH(makeRequest({ ...validBody, name: '' }), ctx);
    expect(res.status).toBe(400);
  });

  it('updates the tournament scoped to the owning user and returns the updated row', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const updated = { id: 't1', ...validBody };
    const single = vi.fn().mockResolvedValue({ data: updated, error: null });
    const select = vi.fn(() => ({ single }));
    const eq2 = vi.fn(() => ({ select }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const update = vi.fn(() => ({ eq: eq1 }));
    supabaseMock.from.mockReturnValue({ update });

    const res = await PATCH(makeRequest(validBody), ctx);
    const body = await res.json();

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Meisia Cup',
        played_at: '2026-09-12',
        category: 'challenge',
        best_of: 3,
        placement: 'top_32',
        my_archetype_dex: [157, 156],
      }),
    );
    expect(eq1).toHaveBeenCalledWith('id', 't1');
    expect(eq2).toHaveBeenCalledWith('user_id', 'u1');
    expect(res.status).toBe(200);
    expect(body).toEqual({ tournament: updated });
  });
});
