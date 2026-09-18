import { afterEach, describe, expect, it, vi } from 'vitest';
import { PATCH } from './route';

const supabaseMock = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

// The route's fire-and-forget Vinted queue/cross-user sync calls use the
// service-role client (RLS-bound `supabase` can't see/write sibling users'
// rows) — default it to a fresh, permissive mock per test so those calls
// resolve to "nothing to do" unless a test overrides `serviceMock.from`.
const serviceMock = {
  from: vi.fn(),
};
serviceMock.from.mockReturnValue({
  select: () => ({
    eq: () => ({
      single: () => Promise.resolve({ data: null, error: null }),
      eq: () => Promise.resolve({ data: [], error: null }),
    }),
    not: () => Promise.resolve({ data: [], error: null }),
  }),
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(supabaseMock),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => serviceMock,
}));

afterEach(() => {
  vi.clearAllMocks();
});

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/cards/abc', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe('PATCH /api/cards/[id]', () => {
  it('returns 401 when no user is authenticated', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await PATCH(makeRequest({ suggested_price: 10 }), ctx('abc'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when status is invalid', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: 'u' } },
    });
    // 'archived' is not in the allowed set; 'pokedex' IS allowed since the
    // new MoveToPokedex flow needs to flip cards into the pokédex slot.
    const res = await PATCH(makeRequest({ status: 'archived' as never }), ctx('abc'));
    expect(res.status).toBe(400);
  });

  it('returns 409 pokedex_slot_taken when promoting to pokedex but slot is occupied', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });

    // Pre-check #1: read the target card to learn its pokemon_number.
    const targetSingle = vi.fn().mockResolvedValue({
      data: { pokemon_number: 25, status: 'collection' },
      error: null,
    });
    const targetSelect = vi.fn(() => ({ eq: () => ({ single: targetSingle }) }));

    // Pre-check #2: existing pokedex card for the same pokemon.
    const existingMaybe = vi.fn().mockResolvedValue({
      data: {
        id: 'ex', card_name: 'Pikachu', image_url: null, tcg_image_url: null,
        set_name: null, set_code: null, language: 'JP', condition: 'NM',
        rarity: 'AR', variant: null, pokemon_number: 25, pokemon_name: 'Pikachu',
      },
      error: null,
    });
    const existingSelect = vi.fn(() => ({
      eq: () => ({ eq: () => ({ neq: () => ({ maybeSingle: existingMaybe }) }) }),
    }));

    supabaseMock.from
      .mockReturnValueOnce({ select: targetSelect })
      .mockReturnValueOnce({ select: existingSelect });

    const res = await PATCH(makeRequest({ status: 'pokedex' }), ctx('abc'));
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error).toBe('pokedex_slot_taken');
    expect(json.existingCard?.id).toBe('ex');
  });

  it('updates suggested_price without touching status', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: 'u' } },
    });
    const updated = { id: 'abc', suggested_price: 12.5, status: 'for_sale', pokemon_number: 25 };
    const single = vi.fn().mockResolvedValue({ data: updated, error: null });
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    supabaseMock.from.mockReturnValueOnce({ update });

    const res = await PATCH(makeRequest({ suggested_price: 12.5 }), ctx('abc'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.card.suggested_price).toBe(12.5);
    expect(json.restock).toBeNull();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ suggested_price: 12.5 }),
    );
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('sets price_confirmed_at when suggested_price is explicitly provided', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: 'u' } },
    });
    const updated = { id: 'abc', suggested_price: 12.5, status: 'for_sale', pokemon_number: 25 };
    const single = vi.fn().mockResolvedValue({ data: updated, error: null });
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    supabaseMock.from.mockReturnValueOnce({ update });

    const res = await PATCH(makeRequest({ suggested_price: 12.5 }), ctx('abc'));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ suggested_price: 12.5, price_confirmed_at: expect.any(String) }),
    );
  });

  it('clears price_confirmed_at instead of stamping it when suggested_price is explicitly cleared to null', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: 'u' } },
    });
    const updated = { id: 'abc', suggested_price: null, status: 'for_sale', pokemon_number: 25 };
    const single = vi.fn().mockResolvedValue({ data: updated, error: null });
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    supabaseMock.from.mockReturnValueOnce({ update });

    const res = await PATCH(makeRequest({ suggested_price: null }), ctx('abc'));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ suggested_price: null, price_confirmed_at: null }),
    );
  });

  it('marks sold and returns restock when last for_sale + pokedex exists', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: 'u' } },
    });
    const sold = {
      id: 'abc', status: 'sold', sold_price: 8, pokemon_number: 25, pokemon_name: 'Pikachu',
    };

    // 1st: update returns the sold card
    const updSingle = vi.fn().mockResolvedValue({ data: sold, error: null });
    const updSelect = vi.fn(() => ({ single: updSingle }));
    const updEq = vi.fn(() => ({ select: updSelect }));
    const update = vi.fn(() => ({ eq: updEq }));

    // 2nd: count remaining for_sale = 0
    const forSaleResp = { data: [], error: null };
    const forSaleEq2 = vi.fn(() => Promise.resolve(forSaleResp));
    const forSaleEq1 = vi.fn(() => ({ eq: forSaleEq2 }));
    const forSaleSelect = vi.fn(() => ({ eq: forSaleEq1 }));

    // 3rd: count remaining stock (collection) = 0 → restock allowed to fire
    const stockResp = { data: [], error: null };
    const stockEq2 = vi.fn(() => Promise.resolve(stockResp));
    const stockEq1 = vi.fn(() => ({ eq: stockEq2 }));
    const stockSelect = vi.fn(() => ({ eq: stockEq1 }));

    // 4th: pokedex card exists
    const pokedexResp = { data: { pokemon_name: 'Pikachu' }, error: null };
    const pokedexMaybe = vi.fn(() => Promise.resolve(pokedexResp));
    const pokedexEq2 = vi.fn(() => ({ maybeSingle: pokedexMaybe }));
    const pokedexEq1 = vi.fn(() => ({ eq: pokedexEq2 }));
    const pokedexSelect = vi.fn(() => ({ eq: pokedexEq1 }));

    supabaseMock.from
      .mockReturnValueOnce({ update })                    // PATCH
      .mockReturnValueOnce({ select: forSaleSelect })     // count for_sale
      .mockReturnValueOnce({ select: stockSelect })       // count collection
      .mockReturnValueOnce({ select: pokedexSelect });    // get pokedex

    const res = await PATCH(
      makeRequest({ status: 'sold', sold_price: 8 }),
      ctx('abc'),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.card.status).toBe('sold');
    expect(json.restock).toEqual({ pokemon_number: 25, pokemon_name: 'Pikachu' });
  });

  it('marks sold and returns null restock when no pokedex exists', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: 'u' } },
    });
    const sold = { id: 'abc', status: 'sold', pokemon_number: 25 };
    const updSingle = vi.fn().mockResolvedValue({ data: sold, error: null });
    const update = vi.fn(() => ({ eq: () => ({ select: () => ({ single: updSingle }) }) }));

    const forSaleEq2 = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const forSaleSelect = vi.fn(() => ({ eq: () => ({ eq: forSaleEq2 }) }));

    const stockEq2 = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const stockSelect = vi.fn(() => ({ eq: () => ({ eq: stockEq2 }) }));

    const pokedexMaybe = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const pokedexSelect = vi.fn(() => ({ eq: () => ({ eq: () => ({ maybeSingle: pokedexMaybe }) }) }));

    supabaseMock.from
      .mockReturnValueOnce({ update })
      .mockReturnValueOnce({ select: forSaleSelect })
      .mockReturnValueOnce({ select: stockSelect })
      .mockReturnValueOnce({ select: pokedexSelect });

    const res = await PATCH(
      makeRequest({ status: 'sold' }),
      ctx('abc'),
    );
    const json = await res.json();
    expect(json.restock).toBeNull();
  });

  it('enqueues a cross-user delete job when a card with a sibling active listing is marked sold', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const sold = { id: 'abc', status: 'sold', pokemon_number: 25 };
    const updSingle = vi.fn().mockResolvedValue({ data: sold, error: null });
    const update = vi.fn(() => ({ eq: () => ({ select: () => ({ single: updSingle }) }) }));

    const forSaleEq2 = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const forSaleSelect = vi.fn(() => ({ eq: () => ({ eq: forSaleEq2 }) }));

    const stockEq2 = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const stockSelect = vi.fn(() => ({ eq: () => ({ eq: stockEq2 }) }));

    const pokedexMaybe = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const pokedexSelect = vi.fn(() => ({ eq: () => ({ eq: () => ({ maybeSingle: pokedexMaybe }) }) }));

    // syncVintedQueueMembership's own `cards` lookup — return no row so it
    // bails out immediately without issuing further queries of its own.
    const queueSyncSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const queueSyncSelect = vi.fn(() => ({ eq: () => ({ single: queueSyncSingle }) }));

    // enqueueCrossUserDeleteJobs' card_listings lookup — one sibling listing
    // owned by a different user, still live on Vinted.
    const siblingListings = vi.fn(() =>
      Promise.resolve({ data: [{ user_id: 'other-user', vinted_listing_id: 'vl-123' }], error: null }),
    );
    const siblingSelect = vi.fn(() => ({ eq: () => ({ neq: () => ({ not: siblingListings }) }) }));

    const jobsInsert = vi.fn(() => Promise.resolve({ data: null, error: null }));

    supabaseMock.from
      .mockReturnValueOnce({ update })                  // PATCH
      .mockReturnValueOnce({ select: forSaleSelect })   // count for_sale
      .mockReturnValueOnce({ select: stockSelect })     // count collection
      .mockReturnValueOnce({ select: pokedexSelect });  // get pokedex

    // syncVintedQueueMembership and enqueueCrossUserDeleteJobs both run on
    // the service-role client (RLS blocks reading/writing sibling users'
    // rows), not the RLS-bound `supabase` used above. Keyed by table name
    // (rather than call-order mockReturnValueOnce) since the two helpers'
    // queries interleave and don't resolve in a fixed sequence.
    serviceMock.from.mockImplementation((table: string) => {
      if (table === 'cards') return { select: queueSyncSelect };
      if (table === 'card_listings') return { select: siblingSelect };
      if (table === 'vinted_post_jobs') return { insert: jobsInsert };
      throw new Error(`unmocked service table: ${table}`);
    });

    const res = await PATCH(makeRequest({ status: 'sold' }), ctx('abc'));
    expect(res.status).toBe(200);

    // The queue sync + cross-user delete enqueue are fire-and-forget (not
    // awaited by the route) — flush the microtask queue so they settle
    // before asserting on their side effects.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(jobsInsert).toHaveBeenCalledWith(
      expect.objectContaining({ card_id: 'abc', user_id: 'other-user', job_type: 'delete' }),
    );
  });

  it('marks traded with photo + date and fires the same restock detection as sold', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const traded = { id: 'abc', status: 'traded', pokemon_number: 25, pokemon_name: 'Pikachu' };
    const updSingle = vi.fn().mockResolvedValue({ data: traded, error: null });
    const update = vi.fn((_payload: Record<string, unknown>) => ({ eq: () => ({ select: () => ({ single: updSingle }) }) }));

    const forSaleEq2 = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const forSaleSelect = vi.fn(() => ({ eq: () => ({ eq: forSaleEq2 }) }));
    const stockEq2 = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const stockSelect = vi.fn(() => ({ eq: () => ({ eq: stockEq2 }) }));
    const pokedexMaybe = vi.fn(() => Promise.resolve({ data: { pokemon_name: 'Pikachu' }, error: null }));
    const pokedexSelect = vi.fn(() => ({ eq: () => ({ eq: () => ({ maybeSingle: pokedexMaybe }) }) }));

    supabaseMock.from
      .mockReturnValueOnce({ update })
      .mockReturnValueOnce({ select: forSaleSelect })
      .mockReturnValueOnce({ select: stockSelect })
      .mockReturnValueOnce({ select: pokedexSelect });

    const res = await PATCH(
      makeRequest({ status: 'traded', traded_at: '2026-07-01T12:00:00Z', trade_photo_url: 'https://x/photo.jpg' }),
      ctx('abc'),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'traded',
        traded_at: '2026-07-01T12:00:00Z',
        traded_by_user_id: 'u',
        trade_photo_url: 'https://x/photo.jpg',
      }),
    );
    // A trade must never stamp the sold fields.
    expect(update.mock.calls[0][0]).not.toHaveProperty('sold_by_user_id');
    expect(update.mock.calls[0][0]).not.toHaveProperty('date_sold');
    expect(json.restock).toEqual({ pokemon_number: 25, pokemon_name: 'Pikachu' });
  });

  it('returns 404 when the row does not exist', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'not found' },
    });
    const update = vi.fn(() => ({ eq: () => ({ select: () => ({ single }) }) }));
    supabaseMock.from.mockReturnValueOnce({ update });
    const res = await PATCH(makeRequest({ suggested_price: 10 }), ctx('missing'));
    expect(res.status).toBe(404);
  });
});
