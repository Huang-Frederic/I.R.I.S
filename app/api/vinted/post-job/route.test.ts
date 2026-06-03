import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mockCard = {
  id: 'card-1',
  status: 'for_sale',
  vinted_listing_id: null,
  user_id: 'user-1',
};

const supabaseMock = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(supabaseMock),
}));

afterEach(() => vi.clearAllMocks());

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/vinted/post-job', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/vinted/post-job', () => {
  it('returns 401 when not authenticated', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest({ card_id: 'card-1' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when card_id is missing', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 409 when card already has a listing', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    supabaseMock.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { ...mockCard, vinted_listing_id: 'existing-id' },
        error: null,
      }),
    });
    const res = await POST(makeRequest({ card_id: 'card-1' }));
    expect(res.status).toBe(409);
  });

  it('creates a job and returns 201', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const jobRow = { id: 'job-1', card_id: 'card-1', status: 'pending' };
    const fromMock = vi.fn()
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockCard, error: null }),
      })
      .mockReturnValueOnce({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: jobRow, error: null }),
      });
    supabaseMock.from = fromMock;
    const res = await POST(makeRequest({ card_id: 'card-1' }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.job_id).toBe('job-1');
  });
});
