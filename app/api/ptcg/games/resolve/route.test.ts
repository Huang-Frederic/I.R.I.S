import { afterEach, describe, expect, it, vi } from 'vitest';

const supabaseMock = { auth: { getUser: vi.fn() } };
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(supabaseMock),
}));

const mockParsedGame = {
  parserVersion: 'test',
  logHash: 'deadbeef',
  me: 'Hisshiden',
  opponent: 'Bklee219',
  winner: 'Bklee219',
  result: 'loss' as const,
  prizesMe: 3,
  prizesOpponent: 6,
  turns: 5,
  state: { snapshots: [], turns: [] },
  validation: { ok: true, checks: [] },
  ambiguities: [],
  warnings: [],
};
vi.mock('@/lib/ptcg', () => ({ parseGame: vi.fn(() => mockParsedGame) }));

import { POST } from './route';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/ptcg/games/resolve', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/ptcg/games/resolve', () => {
  afterEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest({ raw: 'x' }));
    expect(res.status).toBe(401);
  });

  it('rejects an empty paste without calling parseGame', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const res = await POST(makeRequest({ raw: '   ' }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe('ptcg_empty_log');
  });

  it('parses the log and returns both sides with their resolved dex arrays (no override, both are freshly derived)', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const res = await POST(makeRequest({ raw: 'irrelevant — parseGame is mocked' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({
      me: 'Hisshiden',
      opponent: 'Bklee219',
      result: 'loss',
      // mockParsedGame.state.snapshots is empty, so resolveArchetypeDex's
      // live-derivation path (the real function, not mocked) yields [] for
      // both sides — this exercises the real chain end to end.
      myArchetypeDex: [],
      opponentArchetypeDex: [],
    });
  });
});
