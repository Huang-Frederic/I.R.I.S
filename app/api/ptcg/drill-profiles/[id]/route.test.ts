import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, PATCH, DELETE } from './route';

const supabaseMock = { auth: { getUser: vi.fn() }, from: vi.fn() };

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(supabaseMock),
}));

afterEach(() => vi.clearAllMocks());

const ctx = { params: Promise.resolve({ id: 'p1' }) };

function makeRequest(method: string, body?: unknown): Request {
  return new Request('http://localhost/api/ptcg/drill-profiles/p1', {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe('GET /api/ptcg/drill-profiles/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(makeRequest('GET'), ctx);
    expect(res.status).toBe(401);
  });

  it('returns 404 when the profile does not exist for this user', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    supabaseMock.from.mockReturnValue({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }) });
    const res = await GET(makeRequest('GET'), ctx);
    expect(res.status).toBe(404);
  });

  it('returns the profile with resolved images', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const profile = {
      id: 'p1',
      user_id: 'u',
      name: 'Typhlosion',
      cards: [{ id: 'DRI-32', name: 'Héricendre de Luth', count: 4, category: 'poke' }],
      target_ids: ['DRI-32'],
    };
    const maybeSingle = vi.fn().mockResolvedValue({ data: profile, error: null });
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'ptcg_drill_profiles') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }) };
      }
      if (table === 'tcg_catalog') {
        return {
          select: () => ({
            eq: function (this: unknown) { return this; },
            in: () => Promise.resolve({ data: [{ card_name: 'x', image_url: 'http://x.png', language: 'FR' }] }),
          }),
        };
      }
      throw new Error(`unmocked table: ${table}`);
    });
    const res = await GET(makeRequest('GET'), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.profile.id).toBe('p1');
    expect(json.images).toEqual({ 'DRI-32': 'http://x.png' });
  });
});

describe('PATCH /api/ptcg/drill-profiles/[id]', () => {
  it('returns 400 for an invalid body', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const res = await PATCH(makeRequest('PATCH', { name: '' }), ctx);
    expect(res.status).toBe(400);
  });

  it('updates and returns the profile', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const single = vi.fn().mockResolvedValue({
      data: { id: 'p1', name: 'Renamed', cards: [], target_ids: [] },
      error: null,
    });
    const select = vi.fn(() => ({ single }));
    const eq2 = vi.fn(() => ({ select }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const update = vi.fn(() => ({ eq: eq1 }));
    supabaseMock.from.mockReturnValue({ update });
    const body = {
      name: 'Renamed',
      cards: [{ id: 'DRI-32', name: 'x', count: 1, category: 'poke' }],
      target_ids: ['DRI-32'],
      pokemon_number: 157,
    };
    const res = await PATCH(makeRequest('PATCH', body), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.profile.name).toBe('Renamed');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ pokemon_number: 157 }));
  });
});

describe('DELETE /api/ptcg/drill-profiles/[id]', () => {
  it('deletes the profile scoped to the current user', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const eq2 = vi.fn().mockResolvedValue({ error: null });
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const del = vi.fn(() => ({ eq: eq1 }));
    supabaseMock.from.mockReturnValue({ delete: del });
    const res = await DELETE(makeRequest('DELETE'), ctx);
    expect(res.status).toBe(200);
    expect(eq1).toHaveBeenCalledWith('id', 'p1');
    expect(eq2).toHaveBeenCalledWith('user_id', 'u');
  });
});
