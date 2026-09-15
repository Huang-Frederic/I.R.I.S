import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';

const supabaseMock = { auth: { getUser: vi.fn() }, from: vi.fn() };

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(supabaseMock),
}));

afterEach(() => vi.clearAllMocks());

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost/api/ptcg/drill-profiles', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('GET /api/ptcg/drill-profiles', () => {
  it('returns 401 when not authenticated', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('lists the current user\'s profiles', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const order = vi.fn().mockResolvedValue({ data: [{ id: 'p1', name: 'Typhlosion' }], error: null });
    supabaseMock.from.mockReturnValue({ select: () => ({ eq: () => ({ order }) }) });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.profiles).toEqual([{ id: 'p1', name: 'Typhlosion' }]);
  });
});

describe('POST /api/ptcg/drill-profiles', () => {
  const validBody = {
    name: 'Typhlosion',
    cards: [{ id: 'DRI-32', name: 'Héricendre de Luth', count: 4, category: 'poke' }],
    target_ids: ['DRI-32'],
    pokemon_number: 157,
  };

  it('returns 401 when not authenticated', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makePostRequest(validBody));
    expect(res.status).toBe(401);
  });

  it('returns 400 when name is empty', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const res = await POST(makePostRequest({ ...validBody, name: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when cards is empty', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const res = await POST(makePostRequest({ ...validBody, cards: [] }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when a target id is not in cards', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const res = await POST(makePostRequest({ ...validBody, target_ids: ['NOPE-1'] }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when pokemon_number is missing', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const { pokemon_number: _drop, ...noPokemon } = validBody;
    const res = await POST(makePostRequest(noPokemon));
    expect(res.status).toBe(400);
  });

  it('returns 400 when pokemon_number is out of range', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const res = await POST(makePostRequest({ ...validBody, pokemon_number: 0 }));
    expect(res.status).toBe(400);
    const res2 = await POST(makePostRequest({ ...validBody, pokemon_number: 1026 }));
    expect(res2.status).toBe(400);
  });

  it('inserts the profile and returns it', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const single = vi.fn().mockResolvedValue({ data: { id: 'p1', ...validBody }, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    supabaseMock.from.mockReturnValue({ insert });
    const res = await POST(makePostRequest(validBody));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.profile.id).toBe('p1');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u', name: 'Typhlosion', pokemon_number: 157 }),
    );
  });
});
