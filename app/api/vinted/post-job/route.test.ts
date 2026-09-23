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
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: jobRow, error: null }),
        };
      }
      if (table === 'vinted_queue') {
        return {
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
        };
      }
      return {};
    });
    const res = await POST(makeRequest({ card_id: 'card-1' }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.job_id).toBe('job-1');
  });

  it('removes the matching vinted_queue row after creating a card job', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const jobRow = { id: 'job-1', card_id: 'card-1', status: 'pending' };
    const queueDeleteEq = vi.fn().mockReturnThis();
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
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: jobRow, error: null }),
        };
      }
      if (table === 'vinted_queue') {
        return {
          delete: vi.fn().mockReturnThis(),
          eq: queueDeleteEq,
          then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
        };
      }
      return {};
    });
    const res = await POST(makeRequest({ card_id: 'card-1' }));
    expect(res.status).toBe(201);
    expect(queueDeleteEq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(queueDeleteEq).toHaveBeenCalledWith('card_id', 'card-1');
  });

  const mockLot = {
    id: 'lot-1',
    status: 'for_sale',
    price: 12.00,
  };

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

  it('returns 404 when lot not found', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'lots') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
        };
      }
      return {};
    });
    const res = await POST(makeRequest({ lot_id: 'lot-1' }));
    expect(res.status).toBe(404);
  });

  it('creates a lot job and returns 201', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const jobRow = { id: 'job-2', lot_id: 'lot-1', status: 'pending' };
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'lots') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockLot, error: null }),
        };
      }
      if (table === 'lot_listings') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      if (table === 'vinted_post_jobs') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: jobRow, error: null }),
        };
      }
      if (table === 'vinted_queue') {
        return {
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
        };
      }
      return {};
    });
    const res = await POST(makeRequest({ lot_id: 'lot-1' }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.job_id).toBe('job-2');
  });

  it('removes the matching vinted_queue row after creating a lot job', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const jobRow = { id: 'job-2', lot_id: 'lot-1', status: 'pending' };
    const queueDeleteEq = vi.fn().mockReturnThis();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'lots') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockLot, error: null }),
        };
      }
      if (table === 'lot_listings') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      if (table === 'vinted_post_jobs') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: jobRow, error: null }),
        };
      }
      if (table === 'vinted_queue') {
        return {
          delete: vi.fn().mockReturnThis(),
          eq: queueDeleteEq,
          then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
        };
      }
      return {};
    });
    const res = await POST(makeRequest({ lot_id: 'lot-1' }));
    expect(res.status).toBe(201);
    expect(queueDeleteEq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(queueDeleteEq).toHaveBeenCalledWith('lot_id', 'lot-1');
  });

  it('returns 400 when a card repost is requested but there is no existing listing', async () => {
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
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {};
    });
    const res = await POST(makeRequest({ card_id: 'card-1', job_type: 'repost' }));
    expect(res.status).toBe(400);
  });

  it('creates a repost job for a card that already has a listing, without touching vinted_queue', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const jobRow = { id: 'job-3', card_id: 'card-1', status: 'pending' };
    const insertMock = vi.fn().mockReturnThis();
    const touchedTables: string[] = [];
    supabaseMock.from.mockImplementation((table: string) => {
      touchedTables.push(table);
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
      if (table === 'vinted_post_jobs') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: insertMock,
          single: vi.fn().mockResolvedValue({ data: jobRow, error: null }),
        };
      }
      return {};
    });
    const res = await POST(makeRequest({ card_id: 'card-1', job_type: 'repost' }));
    expect(res.status).toBe(201);
    expect(insertMock).toHaveBeenCalledWith({ card_id: 'card-1', user_id: 'user-1', job_type: 'repost', triggered_by: 'manual' });
    expect(touchedTables).not.toContain('vinted_queue');
  });

  it('returns 400 when a lot repost is requested but there is no existing listing', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'lots') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockLot, error: null }),
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
    const res = await POST(makeRequest({ lot_id: 'lot-1', job_type: 'repost' }));
    expect(res.status).toBe(400);
  });

  it('creates a repost job for a lot that already has a listing, without touching vinted_queue', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const jobRow = { id: 'job-4', lot_id: 'lot-1', status: 'pending' };
    const insertMock = vi.fn().mockReturnThis();
    const touchedTables: string[] = [];
    supabaseMock.from.mockImplementation((table: string) => {
      touchedTables.push(table);
      if (table === 'lots') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockLot, error: null }),
        };
      }
      if (table === 'lot_listings') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { vinted_listing_id: 'existing-id' }, error: null }),
        };
      }
      if (table === 'vinted_post_jobs') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: insertMock,
          single: vi.fn().mockResolvedValue({ data: jobRow, error: null }),
        };
      }
      return {};
    });
    const res = await POST(makeRequest({ lot_id: 'lot-1', job_type: 'repost' }));
    expect(res.status).toBe(201);
    expect(insertMock).toHaveBeenCalledWith({ lot_id: 'lot-1', user_id: 'user-1', job_type: 'repost', triggered_by: 'manual' });
    expect(touchedTables).not.toContain('vinted_queue');
  });
});
