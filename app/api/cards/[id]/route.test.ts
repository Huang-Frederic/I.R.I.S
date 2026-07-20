import { afterEach, describe, expect, it, vi } from 'vitest';
import { PATCH } from './route';

const supabaseMock = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(supabaseMock),
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
