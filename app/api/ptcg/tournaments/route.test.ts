import { afterEach, describe, expect, it, vi } from 'vitest';

const supabaseMock = { auth: { getUser: vi.fn() }, from: vi.fn() };
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(supabaseMock),
}));

import { POST } from './route';

function makeRequest(body?: unknown): Request {
  return new Request('http://localhost/api/ptcg/tournaments', {
    method: 'POST',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const validBody = {
  name: 'Meisia Cup',
  playedAt: '2026-09-12',
  category: 'challenge',
  bestOf: 3,
  placement: 'top_32',
  myArchetypeDex: [157, 156],
};

describe('POST /api/ptcg/tournaments', () => {
  afterEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(401);
  });

  it('rejects a body with no name', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const res = await POST(makeRequest({ ...validBody, name: '  ' }));
    expect(res.status).toBe(400);
  });

  it('rejects an invalid date', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const res = await POST(makeRequest({ ...validBody, playedAt: 'not-a-date' }));
    expect(res.status).toBe(400);
  });

  it('rejects an unknown category', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const res = await POST(makeRequest({ ...validBody, category: 'invalid' }));
    expect(res.status).toBe(400);
  });

  it('rejects a bestOf other than 1 or 3', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const res = await POST(makeRequest({ ...validBody, bestOf: 2 }));
    expect(res.status).toBe(400);
  });

  it('defaults placement to no_placement when omitted', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const single = vi.fn().mockResolvedValue({ data: { id: 't1' }, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    supabaseMock.from.mockReturnValue({ insert });

    const { placement: _placement, ...rest } = validBody;
    void _placement;
    await POST(makeRequest(rest));

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ placement: 'no_placement' }));
  });

  it('inserts with the authenticated user id and returns 201', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const savedTournament = { id: 't1', ...validBody };
    const single = vi.fn().mockResolvedValue({ data: savedTournament, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    supabaseMock.from.mockReturnValue({ insert });

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u1',
        name: 'Meisia Cup',
        played_at: '2026-09-12',
        category: 'challenge',
        best_of: 3,
        placement: 'top_32',
        my_archetype_dex: [157, 156],
      }),
    );
    expect(res.status).toBe(201);
    expect(body).toEqual({ tournament: savedTournament });
  });
});
