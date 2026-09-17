import { afterEach, describe, expect, it, vi } from 'vitest';

const supabaseMock = { auth: { getUser: vi.fn() }, from: vi.fn() };
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(supabaseMock),
}));

import { POST } from './route';

function makeRequest(body?: unknown): Request {
  return new Request('http://localhost/api/ptcg/tournaments/t1/rounds', {
    method: 'POST',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const ctx = { params: Promise.resolve({ id: 't1' }) };

describe('POST /api/ptcg/tournaments/[id]/rounds', () => {
  afterEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest({ games: [{ result: 'win', wentFirst: true }] }), ctx);
    expect(res.status).toBe(401);
  });

  it('rejects a round with both games and an outcome', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const res = await POST(
      makeRequest({ games: [{ result: 'win', wentFirst: true }], outcome: 'bye' }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it('rejects a round with neither games nor an outcome', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const res = await POST(makeRequest({ games: [] }), ctx);
    expect(res.status).toBe(400);
  });

  it('computes round_number as one past the highest existing round, and inserts', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const limit = vi.fn().mockResolvedValue({ data: [{ round_number: 2 }], error: null });
    const order = vi.fn(() => ({ limit }));
    const eqCount = vi.fn(() => ({ order }));
    const selectCount = vi.fn(() => ({ eq: eqCount }));

    const savedRound = {
      id: 'r1',
      tournament_id: 't1',
      round_number: 3,
      opponent_archetype_dex: [658],
      games: [{ result: 'win', wentFirst: true }],
      outcome: null,
      created_at: '2026-09-17T00:00:00.000Z',
    };
    const single = vi.fn().mockResolvedValue({ data: savedRound, error: null });
    const selectInsert = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select: selectInsert }));

    supabaseMock.from.mockReturnValue({ select: selectCount, insert });

    const res = await POST(
      makeRequest({
        opponentArchetypeDex: [658],
        games: [{ result: 'win', wentFirst: true }],
      }),
      ctx,
    );
    const body = await res.json();

    expect(eqCount).toHaveBeenCalledWith('tournament_id', 't1');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tournament_id: 't1',
        round_number: 3,
        opponent_archetype_dex: [658],
        games: [{ result: 'win', wentFirst: true }],
        outcome: null,
      }),
    );
    expect(res.status).toBe(201);
    expect(body).toEqual({ round: savedRound });
  });

  it('starts round_number at 1 for the tournament’s first round', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn(() => ({ limit }));
    const eqCount = vi.fn(() => ({ order }));
    const selectCount = vi.fn(() => ({ eq: eqCount }));
    const single = vi.fn().mockResolvedValue({ data: { id: 'r1', round_number: 1 }, error: null });
    const selectInsert = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select: selectInsert }));
    supabaseMock.from.mockReturnValue({ select: selectCount, insert });

    await POST(makeRequest({ outcome: 'bye' }), ctx);

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ round_number: 1 }));
  });
});
