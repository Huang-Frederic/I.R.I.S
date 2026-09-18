import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GET, POST } from './route';

const mockGetUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({ auth: { getUser: mockGetUser } }),
}));

const mockUpsert = vi.fn();
const mockMaybeSingle = vi.fn();
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => ({
      upsert: mockUpsert,
      select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }),
    }),
  }),
}));

const USER_A = '35385d3c-5966-4a10-8568-8d92d1be47e7';
const USER_B = 'a018a4ef-e02e-4a67-9732-9fafe3167e10';

function makeJwt(payload: object): string {
  const b64 = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.signature`;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VINTED_USER_IDS = `${USER_A},${USER_B}`;
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_A } } });
  mockUpsert.mockResolvedValue({ error: null });
});

describe('POST /api/vinted/sessions', () => {
  it('upserts cookies for a Vinted-enabled target user', async () => {
    const request = new Request('http://test', {
      method: 'POST',
      body: JSON.stringify({ userId: USER_B, cookies: { access_token_web: 'abc' } }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: USER_B, cookies: { access_token_web: 'abc' } }),
    );
  });

  it('rejects a userId outside VINTED_USER_IDS', async () => {
    const request = new Request('http://test', {
      method: 'POST',
      body: JSON.stringify({ userId: 'someone-else', cookies: {} }),
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const request = new Request('http://test', {
      method: 'POST',
      body: JSON.stringify({ userId: USER_B, cookies: {} }),
    });
    expect((await POST(request)).status).toBe(401);
  });

  it('rejects a non-object cookies field', async () => {
    const request = new Request('http://test', {
      method: 'POST',
      body: JSON.stringify({ userId: USER_B, cookies: 'not-an-object' }),
    });
    expect((await POST(request)).status).toBe(400);
  });
});

describe('GET /api/vinted/sessions', () => {
  it('reports an expired session', async () => {
    const pastExp = Math.floor(Date.now() / 1000) - 3600;
    mockMaybeSingle.mockResolvedValue({ data: { cookies: { refresh_token_web: makeJwt({ exp: pastExp }) } } });
    const request = new Request(`http://test?userId=${USER_B}`);
    const response = await GET(request);
    const json = await response.json();
    expect(json).toEqual({ hasSession: true, expired: true, expiresWithin48h: true });
  });

  it('reports a healthy session with plenty of time left', async () => {
    const farExp = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    mockMaybeSingle.mockResolvedValue({ data: { cookies: { refresh_token_web: makeJwt({ exp: farExp }) } } });
    const request = new Request(`http://test?userId=${USER_B}`);
    const response = await GET(request);
    const json = await response.json();
    expect(json).toEqual({ hasSession: true, expired: false, expiresWithin48h: false });
  });

  it('reports no session when none exists', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null });
    const request = new Request(`http://test?userId=${USER_B}`);
    const response = await GET(request);
    const json = await response.json();
    expect(json).toEqual({ hasSession: false, expired: true, expiresWithin48h: true });
  });

  it('rejects a userId outside VINTED_USER_IDS', async () => {
    const request = new Request('http://test?userId=someone-else');
    expect((await GET(request)).status).toBe(403);
  });
});
