// app/api/prices/update/route.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const serviceMock = {
  from: vi.fn(),
};
const supabaseMock = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => serviceMock,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(supabaseMock),
}));

const ORIGINAL_SECRET = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = 'test-secret';
});

afterEach(() => {
  process.env.CRON_SECRET = ORIGINAL_SECRET;
  vi.clearAllMocks();
});

function bulkRequest(authHeader?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (authHeader) headers['authorization'] = authHeader;
  return new Request('http://localhost/api/prices/update', {
    method: 'POST',
    headers,
  });
}

describe('POST /api/prices/update — auth', () => {
  it('returns 401 in bulk mode when no Authorization header is provided', async () => {
    const res = await POST(bulkRequest());
    expect(res.status).toBe(401);
  });

  it('returns 401 in bulk mode with a wrong secret', async () => {
    const res = await POST(bulkRequest('Bearer wrong'));
    expect(res.status).toBe(401);
  });
});

// --- helpers for the bulk pipeline tests ---
function row(over: Record<string, unknown> = {}) {
  return {
    id: 'card-1', card_id_tcg: 'sv2a-25',
    set_code: 'sv2a', set_number: '025', language: 'JP',
    variant: null, cm_price_trend: null, suggested_price: null,
    ...over,
  };
}

function authedBulk(): Request {
  return new Request('http://localhost/api/prices/update', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer test-secret',
    },
  });
}

function setupServiceRead(rows: ReturnType<typeof row>[]) {
  const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
  const order = vi.fn(() => ({ limit }));
  const eq = vi.fn(() => ({ order }));
  serviceMock.from.mockImplementation((table: string) => {
    if (table === 'cards') {
      return { select: vi.fn(() => ({ eq })), update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })) };
    }
    if (table === 'config') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: { value: '0.85' }, error: null,
            }),
          })),
        })),
      };
    }
    throw new Error(`unmocked table: ${table}`);
  });
}

describe('POST /api/prices/update — bulk mode', () => {
  it('returns 200 with empty summary when no cards are eligible', async () => {
    setupServiceRead([]);
    const res = await POST(authedBulk());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.total).toBe(0);
    expect(json.updated).toBe(0);
  });

  it('skips cards with variant != null (preserves manual variant prices)', async () => {
    setupServiceRead([row({ id: 'a', variant: 'pokeball' })]);
    const res = await POST(authedBulk());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.skipped).toBe(1);
    expect(json.updated).toBe(0);
  });

  it('updates a tcgdex-categorized card with new prices and timestamp', async () => {
    setupServiceRead([row({ id: 'a' })]);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pricing: {
          cardmarket: { idProduct: 12345, low: 1.5, trend: 2.5, avg: 2.0 },
        },
      }),
    }) as unknown as typeof fetch;
    const res = await POST(authedBulk());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.updated).toBe(1);
    expect(json.skipped).toBe(0);
  });

  it('does not write prices when TCGdex returns pricing.cardmarket = null', async () => {
    setupServiceRead([row({ id: 'a' })]);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pricing: { cardmarket: null } }),
    }) as unknown as typeof fetch;
    const res = await POST(authedBulk());
    const json = await res.json();
    expect(json.updated).toBe(0);
    expect(json.skipped).toBe(1);
  });

  it('continues processing when TCGdex returns 500 on one card and adds to errors', async () => {
    setupServiceRead([row({ id: 'a' }), row({ id: 'b' })]);
    let call = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      call += 1;
      if (call === 1) return { ok: false, status: 500, text: async () => 'boom' };
      return {
        ok: true,
        json: async () => ({
          pricing: { cardmarket: { idProduct: 1, low: 1, trend: 1, avg: 1 } },
        }),
      };
    }) as unknown as typeof fetch;
    const res = await POST(authedBulk());
    const json = await res.json();
    expect(json.errors).toHaveLength(1);
    expect(json.errors[0].card_id).toBe('a');
    expect(json.updated).toBe(1);
  });
});
