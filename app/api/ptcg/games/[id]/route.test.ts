import { afterEach, describe, expect, it, vi } from 'vitest';

const supabaseMock = { auth: { getUser: vi.fn() }, from: vi.fn() };
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(supabaseMock),
}));

import { GET, PATCH } from './route';

function makeRequest(method: string, body?: unknown): Request {
  return new Request('http://localhost/api/ptcg/games/g1', {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const ctx = { params: Promise.resolve({ id: 'g1' }) };

describe('GET /api/ptcg/games/[id]', () => {
  afterEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(makeRequest('GET'), ctx);
    expect(res.status).toBe(401);
  });

  it('returns 404 when the game does not exist (or belongs to another user)', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    supabaseMock.from.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }),
    });
    const res = await GET(makeRequest('GET'), ctx);
    expect(res.status).toBe(404);
  });

  it("derives archetype dex live from state.snapshots when the game's override columns are null", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const game = {
      id: 'g1',
      me: 'Hisshiden',
      opponent: 'Bklee219',
      raw_log: 'raw text',
      // Empty snapshots means the real (unmocked) resolveArchetypeDex's
      // live-derivation path yields [] for both sides — this test exercises
      // that real chain, not a stubbed one.
      state: { snapshots: [], turns: [] },
      my_archetype_dex: null,
      opponent_archetype_dex: null,
    };
    const maybeSingle = vi.fn().mockResolvedValue({ data: game, error: null });
    supabaseMock.from.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }),
    });
    const res = await GET(makeRequest('GET'), ctx);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ game, myArchetypeDex: [], opponentArchetypeDex: [] });
  });

  it('returns the stored override verbatim when set, without deriving live', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const game = {
      id: 'g1',
      me: 'Hisshiden',
      opponent: 'Bklee219',
      raw_log: 'raw text',
      state: { snapshots: [], turns: [] },
      my_archetype_dex: [157],
      opponent_archetype_dex: [658],
    };
    const maybeSingle = vi.fn().mockResolvedValue({ data: game, error: null });
    supabaseMock.from.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }),
    });
    const res = await GET(makeRequest('GET'), ctx);
    const body = await res.json();
    expect(body.myArchetypeDex).toEqual([157]);
    expect(body.opponentArchetypeDex).toEqual([658]);
  });
});

describe('PATCH /api/ptcg/games/[id]', () => {
  afterEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await PATCH(makeRequest('PATCH', { myArchetypeDex: [1] }), ctx);
    expect(res.status).toBe(401);
  });

  it('rejects a body with neither field present', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const res = await PATCH(makeRequest('PATCH', {}), ctx);
    expect(res.status).toBe(400);
  });

  it('updates only the provided archetype-dex column(s), scoped to the owning user', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const single = vi
      .fn()
      .mockResolvedValue({ data: { id: 'g1', my_archetype_dex: [157], opponent_archetype_dex: null }, error: null });
    const select = vi.fn(() => ({ single }));
    const eq2 = vi.fn(() => ({ select }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const update = vi.fn(() => ({ eq: eq1 }));
    supabaseMock.from.mockReturnValue({ update });

    const res = await PATCH(makeRequest('PATCH', { myArchetypeDex: [157] }), ctx);

    expect(update).toHaveBeenCalledWith({ my_archetype_dex: [157] });
    expect(res.status).toBe(200);
  });
});
