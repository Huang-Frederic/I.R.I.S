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
    set_code: 'sv2a', set_number: '025', language: 'EN',
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
  // Bulk read chain: select(...).eq().order().limit() — the cron's per-batch fetch.
  const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
  const order = vi.fn(() => ({ limit }));
  const eq = vi.fn(() => ({ order }));
  // snapshotStockValue chain: select(...).in('status', [...]) — runs after the bulk.
  const inFn = vi.fn().mockResolvedValue({ data: [], error: null });
  // Update chain: update(...).eq(...).select('*').single() — the cron writes back the priced row.
  const updateChain = () => ({
    eq: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: rows[0] ?? null, error: null }),
      })),
    })),
  });
  serviceMock.from.mockImplementation((table: string) => {
    if (table === 'cards') {
      return {
        select: vi.fn(() => ({ eq, in: inFn })),
        update: vi.fn(updateChain),
      };
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
    if (table === 'stock_value_snapshots') {
      return { upsert: vi.fn().mockResolvedValue({ error: null }) };
    }
    // cardmarket_* and tcg_catalog: empty so lookupCardmarketPricing returns
    // no_expansion and the route falls through to the TCGdex live path.
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ in: vi.fn().mockResolvedValue({ data: [], error: null }) })),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
        ilike: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    };
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
    // The /sets endpoint is called once per language (cached after) for the
    // tcgdex-set-mapping helper. Branch on URL: /sets returns the catalog,
    // /cards returns 500 on first call then OK.
    let cardCallCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/sets')) {
        return {
          ok: true,
          json: async () => [],
        };
      }
      cardCallCount += 1;
      if (cardCallCount === 1) return { ok: false, status: 500, text: async () => 'boom' };
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

describe('POST /api/prices/update — single-card mode', () => {
  it('returns 401 when not authenticated', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const req = new Request('http://localhost/api/prices/update?card_id=abc', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns updated card on success', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });

    // Reuse setupServiceRead but for a single-card read instead of a list.
    const targetCard = row({ id: 'abc' });

    // Initial read goes through the session client (so RLS can auto-filter
    // once cards grow per-user ownership). Service client handles the write.
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'cards') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: targetCard, error: null }),
            })),
          })),
        };
      }
      throw new Error(`unmocked supabase table: ${table}`);
    });

    serviceMock.from.mockImplementation((table: string) => {
      if (table === 'cards') {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: { ...targetCard, cm_price_trend: 2.5 },
                  error: null,
                }),
              })),
            })),
          })),
        };
      }
      if (table === 'config') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: { value: '0.85' }, error: null }),
            })),
          })),
        };
      }
      throw new Error(`unmocked service table: ${table}`);
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pricing: { cardmarket: { idProduct: 1, low: 1, trend: 2.5, avg: 2 } },
      }),
    }) as unknown as typeof fetch;

    const req = new Request('http://localhost/api/prices/update?card_id=abc', { method: 'POST' });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.card.id).toBe('abc');
    expect(json.card.cm_price_trend).toBe(2.5);
  });
});
