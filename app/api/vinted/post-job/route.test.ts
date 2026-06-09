import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mockCard = {
  id: 'card-1',
  status: 'for_sale',
  suggested_price: 5.00,
  cm_price_low: null,
  cm_price_avg: null,
};

const supabaseMock = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(supabaseMock),
}));

beforeEach(() => {
  process.env.VINTED_USER_IDS = 'user-1';
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.VINTED_USER_IDS;
});

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

  it('returns 409 when user already has a Vinted listing for this card', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'cards') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockCard, error: null }),
        };
      }
      if (table === 'card_listings') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { vinted_listing_id: 'existing-id' }, error: null }),
        };
      }
      return {};
    });
    const res = await POST(makeRequest({ card_id: 'card-1' }));
    expect(res.status).toBe(409);
  });

  it('creates a job and returns 201', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const jobRow = { id: 'job-1', card_id: 'card-1', status: 'pending' };
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'cards') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockCard, error: null }),
        };
      }
      if (table === 'card_listings') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      if (table === 'vinted_post_jobs') {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: jobRow, error: null }),
        };
      }
      return {};
    });
    const res = await POST(makeRequest({ card_id: 'card-1' }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.job_id).toBe('job-1');
  });
});
