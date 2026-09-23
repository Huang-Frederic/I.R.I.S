import { describe, expect, it, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockGetUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({ auth: { getUser: mockGetUser } }),
}));

const mockUpsert = vi.fn();
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => ({
      upsert: mockUpsert,
    }),
  }),
}));

const USER_A = '35385d3c-5966-4a10-8568-8d92d1be47e7';
const USER_B = 'a018a4ef-e02e-4a67-9732-9fafe3167e10';

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
