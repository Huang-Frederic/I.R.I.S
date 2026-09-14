import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const supabaseMock = { auth: { getUser: vi.fn() }, from: vi.fn() };

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(supabaseMock),
}));

afterEach(() => vi.clearAllMocks());

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/ptcg/drill-profiles/resolve', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/ptcg/drill-profiles/resolve', () => {
  it('returns 401 when not authenticated', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest({ text: '3 Weedle CRI 1' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when text is missing or empty', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const res = await POST(makeRequest({ text: '' }));
    expect(res.status).toBe(400);
  });

  it('parses and resolves a decklist', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    supabaseMock.from.mockReturnValue({
      select: () => ({
        eq: function (this: unknown) { return this; },
        in: () =>
          Promise.resolve({
            data: [{ card_name: 'Héricendre de Luth', image_url: 'http://x.png', language: 'FR' }],
          }),
      }),
    });
    const res = await POST(makeRequest({ text: 'Pokémon : 4\n4 Héricendre de Luth DRI 32' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cards).toEqual([{ id: 'DRI-32', name: 'Héricendre de Luth', count: 4, category: 'poke' }]);
    expect(json.unresolved).toEqual([]);
  });
});
