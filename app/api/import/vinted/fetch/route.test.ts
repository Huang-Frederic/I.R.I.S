import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { POST } from './route';

const ORIG_FETCH = global.fetch;

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/import/vinted/fetch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const SAMPLE_CURL = `curl 'https://www.vinted.fr/api/v2/users/12345678/items?per_page=200&page=1' -H 'cookie: _vinted_fr_session=abc'`;

/** Build a fake Response shape sufficient for the route's introspection
 *  (status/headers.get/json/text). vi mocks of fetch only need this subset. */
function fakeRes(opts: {
  status: number;
  ok?: boolean;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
  contentType?: string;
}): Response {
  return {
    ok: opts.ok ?? (opts.status >= 200 && opts.status < 300),
    status: opts.status,
    statusText: '',
    headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? (opts.contentType ?? 'application/json') : null) },
    json: opts.json ?? (async () => ({})),
    text: opts.text ?? (async () => ''),
  } as unknown as Response;
}

describe('POST /api/import/vinted/fetch', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = ORIG_FETCH;
    vi.restoreAllMocks();
  });

  it('returns 400 when curl is invalid', async () => {
    const res = await POST(makeReq({ curl: 'curl https://example.com' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_curl');
  });

  it('paginates until total_pages is reached and filters non-card items', async () => {
    const items = [
      { id: 1, title: '(jpn_s9-31)', description: 'Pikachu', price: { amount: '5.0', currency_code: 'EUR' }, created_at_ts: 1_700_000_000, photos: [] },
      { id: 2, title: 'Lot de Cartes Pokémon X [JP]', description: '', price: { amount: '20', currency_code: 'EUR' }, created_at_ts: 1_700_000_000, photos: [] },
      { id: 3, title: '(eng_swsh9-1)', description: '', price: { amount: '3', currency_code: 'EUR' }, created_at_ts: 1_700_000_000, photos: [] },
      { id: 4, title: 'T-shirt', description: '', price: { amount: '8', currency_code: 'EUR' }, created_at_ts: 1_700_000_000, photos: [] },
      { id: 5, title: '(fra_sv1-25)', description: '', price: { amount: '4', currency_code: 'EUR' }, created_at_ts: 1_700_000_000, photos: [] },
    ];
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeRes({ status: 200, json: async () => ({ items, pagination: { total_pages: 1 } }) }),
    );

    const res = await POST(makeReq({ curl: SAMPLE_CURL }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(3);
    expect(body.skipped).toBe(2);
  });

  it('returns 401 when Vinted responds with 401 (cookie expired)', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeRes({ status: 401 }));
    const res = await POST(makeReq({ curl: SAMPLE_CURL }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('cookie_expired');
  });

  it('returns 503 when Vinted responds with 403 (cloudflare/datadome blocked)', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeRes({ status: 403 }));
    const res = await POST(makeReq({ curl: SAMPLE_CURL }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('cloudflare_blocked');
  });

  it('paginates across multiple pages', async () => {
    const page1 = {
      items: [{ id: 1, title: '(jpn_s9-31)', description: '', price: { amount: '5', currency_code: 'EUR' }, created_at_ts: 1, photos: [] }],
      pagination: { total_pages: 2 },
    };
    const page2 = {
      items: [{ id: 2, title: '(jpn_s9-32)', description: '', price: { amount: '5', currency_code: 'EUR' }, created_at_ts: 1, photos: [] }],
      pagination: { total_pages: 2 },
    };
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(fakeRes({ status: 200, json: async () => page1 }))
      .mockResolvedValueOnce(fakeRes({ status: 200, json: async () => page2 }));

    const res = await POST(makeReq({ curl: SAMPLE_CURL }));
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.items.map((i: { id: number }) => i.id)).toEqual([1, 2]);
  });
});
