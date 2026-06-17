import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const supabaseMock = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(supabaseMock),
}));

beforeEach(() => { process.env.VINTED_USER_IDS = 'user-1'; });
afterEach(() => { vi.clearAllMocks(); delete process.env.VINTED_USER_IDS; });

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/vinted/bump-job', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/vinted/bump-job', () => {
  it('returns 401 when not authenticated', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest({ card_id: 'card-1' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when neither card_id nor lot_id is provided', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 when both card_id and lot_id are provided', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const res = await POST(makeRequest({ card_id: 'card-1', lot_id: 'lot-1' }));
    expect(res.status).toBe(400);
  });

  it('returns 409 when card has no existing Vinted listing', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'cards') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'card-1', status: 'for_sale', suggested_price: 5 }, error: null }),
        };
      }
      if (table === 'card_listings') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {};
    });
    const res = await POST(makeRequest({ card_id: 'card-1' }));
    expect(res.status).toBe(409);
  });

  it('creates a card repost job and returns 201', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const jobRow = { id: 'job-r1', card_id: 'card-1', status: 'pending', job_type: 'repost' };
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'cards') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'card-1', status: 'for_sale' }, error: null }),
        };
      }
      if (table === 'card_listings') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { vinted_listing_id: 'vint-123' }, error: null }),
        };
      }
      if (table === 'vinted_post_jobs') {
        // active job check: select→eq→eq→in→limit→maybeSingle → no active job
        // insert path: insert→select→single → new job row
        const activeCheckChain = {
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
        return {
          select: vi.fn().mockReturnValue(activeCheckChain),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: jobRow, error: null }),
            }),
          }),
        };
      }
      return {};
    });
    const res = await POST(makeRequest({ card_id: 'card-1' }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.job_id).toBe('job-r1');
  });

  it('returns 409 when lot has no existing Vinted listing', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'lots') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'lot-1', status: 'for_sale', price: 12 }, error: null }),
        };
      }
      if (table === 'lot_listings') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {};
    });
    const res = await POST(makeRequest({ lot_id: 'lot-1' }));
    expect(res.status).toBe(409);
  });

  it('creates a lot repost job and returns 201', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const jobRow = { id: 'job-r2', lot_id: 'lot-1', status: 'pending', job_type: 'repost' };
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'lots') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'lot-1', status: 'for_sale' }, error: null }),
        };
      }
      if (table === 'lot_listings') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { vinted_listing_id: 'vint-456' }, error: null }),
        };
      }
      if (table === 'vinted_post_jobs') {
        const activeCheckChain = {
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
        return {
          select: vi.fn().mockReturnValue(activeCheckChain),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: jobRow, error: null }),
            }),
          }),
        };
      }
      return {};
    });
    const res = await POST(makeRequest({ lot_id: 'lot-1' }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.job_id).toBe('job-r2');
  });
});
