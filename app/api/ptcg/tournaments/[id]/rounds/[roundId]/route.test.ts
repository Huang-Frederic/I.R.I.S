import { afterEach, describe, expect, it, vi } from 'vitest';

const supabaseMock = { auth: { getUser: vi.fn() }, from: vi.fn() };
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(supabaseMock),
}));

import { DELETE, PATCH } from './route';

function makeRequest(method: string, body?: unknown): Request {
  return new Request('http://localhost/api/ptcg/tournaments/t1/rounds/r1', {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const ctx = { params: Promise.resolve({ id: 't1', roundId: 'r1' }) };

describe('PATCH /api/ptcg/tournaments/[id]/rounds/[roundId]', () => {
  afterEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await PATCH(makeRequest('PATCH', { outcome: 'bye' }), ctx);
    expect(res.status).toBe(401);
  });

  it('rejects an invalid body the same way the create route does', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const res = await PATCH(makeRequest('PATCH', { games: [], outcome: null }), ctx);
    expect(res.status).toBe(400);
  });

  it('updates the round by id and returns the updated row', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const updated = {
      id: 'r1',
      tournament_id: 't1',
      round_number: 1,
      opponent_archetype_dex: [658],
      games: [],
      outcome: 'bye',
      created_at: '2026-09-17T00:00:00.000Z',
    };
    const single = vi.fn().mockResolvedValue({ data: updated, error: null });
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    supabaseMock.from.mockReturnValue({ update });

    const res = await PATCH(makeRequest('PATCH', { opponentArchetypeDex: [658], outcome: 'bye' }), ctx);
    const body = await res.json();

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ opponent_archetype_dex: [658], games: [], outcome: 'bye' }),
    );
    expect(eq).toHaveBeenCalledWith('id', 'r1');
    expect(res.status).toBe(200);
    expect(body).toEqual({ round: updated });
  });
});

describe('DELETE /api/ptcg/tournaments/[id]/rounds/[roundId]', () => {
  afterEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await DELETE(makeRequest('DELETE'), ctx);
    expect(res.status).toBe(401);
  });

  it('deletes the round by id and returns ok', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const eq = vi.fn().mockResolvedValue({ error: null });
    const del = vi.fn(() => ({ eq }));
    supabaseMock.from.mockReturnValue({ delete: del });

    const res = await DELETE(makeRequest('DELETE'), ctx);
    const body = await res.json();

    expect(eq).toHaveBeenCalledWith('id', 'r1');
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });
});
