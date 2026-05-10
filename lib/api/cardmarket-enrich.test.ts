import { describe, it, expect, vi } from 'vitest';
import {
  lookupBySetPrefixAndNumber,
  lookupBySetPrefixAndName,
} from './cardmarket-enrich';

interface ExpansionStub {
  id_expansion: number;
  name: string;
  name_en: string | null;
  set_prefix: string | null;
}

interface ProductStub {
  id_product: number;
  name: string;
  card_prefix: string | null;
  card_prefix_normalized: string | null;
  id_expansion: number;
}

interface IndexStub {
  id_product: number;
  id_expansion: number;
  set_number: string;
  url_path: string | null;
  url_variant: string | null;
}

/**
 * Build a Supabase client mock for the new (set_prefix-based) lookups.
 * Returns a thenable-builder per table — every chain method is no-op chainable
 * AND the whole builder resolves to { data, error } when awaited. Lets the
 * test cover any chain shape (.in().eq().limit(), .in() alone, etc.).
 */
function mockSupabase(opts: {
  expansions?: ExpansionStub[];
  products?: ProductStub[];
  indexRows?: IndexStub[];
}) {
  function builder<T>(data: T[]) {
    const result = { data, error: null };
    const b: Record<string, unknown> = {
      select: vi.fn(() => b),
      ilike: vi.fn(() => b),
      eq: vi.fn(() => b),
      in: vi.fn(() => b),
      limit: vi.fn(() => b),
      then: (resolve: (v: { data: T[]; error: null }) => void) => resolve(result),
    };
    return b;
  }
  return {
    from: vi.fn((table: string) => {
      if (table === 'cardmarket_expansions') return builder(opts.expansions ?? []);
      if (table === 'cardmarket_card_index') return builder(opts.indexRows ?? []);
      if (table === 'cardmarket_products') return builder(opts.products ?? []);
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe('lookupBySetPrefixAndNumber (Strategy 0)', () => {
  it('returns the unique card when prefix + number resolve to one product', async () => {
    const supabase = mockSupabase({
      expansions: [
        { id_expansion: 4434, name: 'Brilliant Stars', name_en: 'Brilliant Stars', set_prefix: 'BRS' },
      ],
      indexRows: [
        { id_product: 608425, id_expansion: 4434, set_number: '1', url_path: '/x/y', url_variant: null },
      ],
      products: [
        { id_product: 608425, name: 'Exeggcute', card_prefix: 'Exeggcute', card_prefix_normalized: 'exeggcute', id_expansion: 4434 },
      ],
    });
    const cards = await lookupBySetPrefixAndNumber(supabase as never, 'BRS', '1');
    expect(cards).toHaveLength(1);
    expect(cards[0].cardmarket_id).toBe('608425');
    expect(cards[0].card_name).toBe('Exeggcute');
    expect(cards[0].set_prefix).toBe('BRS');
    // Goes through our proxy route to avoid cardmarket CloudFront 403.
    expect(cards[0].tcg_image_url).toBe('/api/cm-img/608425?prefix=BRS');
  });

  it('returns multiple cards when number has variants (reverse holo)', async () => {
    const supabase = mockSupabase({
      expansions: [
        { id_expansion: 4434, name: 'Brilliant Stars', name_en: 'Brilliant Stars', set_prefix: 'BRS' },
      ],
      indexRows: [
        { id_product: 1, id_expansion: 4434, set_number: '14', url_path: '/x/regular', url_variant: null },
        { id_product: 2, id_expansion: 4434, set_number: '14', url_path: '/x/reverse', url_variant: 'V2' },
      ],
      products: [
        { id_product: 1, name: 'Pikachu', card_prefix: 'Pikachu', card_prefix_normalized: 'pikachu', id_expansion: 4434 },
        { id_product: 2, name: 'Pikachu (Reverse Holo)', card_prefix: 'Pikachu', card_prefix_normalized: 'pikachu', id_expansion: 4434 },
      ],
    });
    const cards = await lookupBySetPrefixAndNumber(supabase as never, 'BRS', '14');
    expect(cards).toHaveLength(2);
  });

  it('returns empty when prefix is unknown', async () => {
    const supabase = mockSupabase({ expansions: [] });
    const cards = await lookupBySetPrefixAndNumber(supabase as never, 'UNKNOWN', '1');
    expect(cards).toEqual([]);
  });

  it('returns empty when number does not exist in expansion', async () => {
    const supabase = mockSupabase({
      expansions: [
        { id_expansion: 4434, name: 'Brilliant Stars', name_en: 'Brilliant Stars', set_prefix: 'BRS' },
      ],
      indexRows: [],
    });
    const cards = await lookupBySetPrefixAndNumber(supabase as never, 'BRS', '999');
    expect(cards).toEqual([]);
  });

  it('returns empty image URL when expansion has no set_prefix backfilled', async () => {
    const supabase = mockSupabase({
      expansions: [
        { id_expansion: 4434, name: 'Brilliant Stars', name_en: 'Brilliant Stars', set_prefix: null },
      ],
      indexRows: [
        { id_product: 608425, id_expansion: 4434, set_number: '1', url_path: '/x/y', url_variant: null },
      ],
      products: [
        { id_product: 608425, name: 'Exeggcute', card_prefix: 'Exeggcute', card_prefix_normalized: 'exeggcute', id_expansion: 4434 },
      ],
    });
    const cards = await lookupBySetPrefixAndNumber(supabase as never, 'BRS', '1');
    expect(cards[0].tcg_image_url).toBe('');
  });
});

describe('lookupBySetPrefixAndName (Strategy 1 picker)', () => {
  it('returns all cards in the expansion whose card_prefix matches the pokemon', async () => {
    const supabase = mockSupabase({
      expansions: [
        { id_expansion: 4434, name: 'Brilliant Stars', name_en: 'Brilliant Stars', set_prefix: 'BRS' },
      ],
      products: [
        { id_product: 1, name: 'Dracaufeu V', card_prefix: 'Dracaufeu V', card_prefix_normalized: 'dracaufeuv', id_expansion: 4434 },
        { id_product: 2, name: 'Dracaufeu', card_prefix: 'Dracaufeu', card_prefix_normalized: 'dracaufeu', id_expansion: 4434 },
        { id_product: 3, name: 'Pikachu', card_prefix: 'Pikachu', card_prefix_normalized: 'pikachu', id_expansion: 4434 },
      ],
      indexRows: [
        { id_product: 1, id_expansion: 4434, set_number: '17', url_path: '/x/v', url_variant: null },
        { id_product: 2, id_expansion: 4434, set_number: 'TG3', url_path: '/x/tg', url_variant: null },
      ],
    });
    const cards = await lookupBySetPrefixAndName(supabase as never, 'BRS', 'Dracaufeu');
    // Both Dracaufeu products match (substring lookup); Pikachu is filtered out.
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.cardmarket_id).sort()).toEqual(['1', '2']);
  });

  it('strips bracketed disambig from card_name', async () => {
    const supabase = mockSupabase({
      expansions: [
        { id_expansion: 1, name: 'Black Bolt', name_en: 'Black Bolt', set_prefix: 'BLK' },
      ],
      products: [
        {
          id_product: 835910,
          name: 'Pansage [Collect | Scratch | SV]',
          card_prefix: 'Pansage',
          card_prefix_normalized: 'pansage',
          id_expansion: 1,
        },
      ],
      indexRows: [
        { id_product: 835910, id_expansion: 1, set_number: '4', url_path: '/x', url_variant: null },
      ],
    });
    const cards = await lookupBySetPrefixAndName(supabase as never, 'BLK', 'Pansage');
    expect(cards[0].card_name).toBe('Pansage');
  });

  it('returns empty when no product matches the pokemon name', async () => {
    const supabase = mockSupabase({
      expansions: [
        { id_expansion: 4434, name: 'Brilliant Stars', name_en: 'Brilliant Stars', set_prefix: 'BRS' },
      ],
      products: [
        { id_product: 1, name: 'Pikachu', card_prefix: 'Pikachu', card_prefix_normalized: 'pikachu', id_expansion: 4434 },
      ],
      indexRows: [],
    });
    const cards = await lookupBySetPrefixAndName(supabase as never, 'BRS', 'Dracaufeu');
    expect(cards).toEqual([]);
  });
});
