import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetExpansionsCacheForTests,
  buildSearchPrefixes,
  buildSyntheticCardmarketUrlPath,
  lookupCardmarketPricing,
  normalize,
  pickAmbiguousIndex,
  tokensSorted,
} from './cardmarket-pricing';
import { makeCard as baseMakeCard } from '@/lib/utils/test-fixtures';
import type { Card } from '@/lib/types';
import type { createServiceClient } from '@/lib/supabase/service';

type ServiceClient = ReturnType<typeof createServiceClient>;

function makeCard(over: Partial<Card> = {}): Card {
  return baseMakeCard({
    id: 'card-1',
    pokemon_name: 'Iron Crown',
    pokemon_number: 1006,
    card_name: 'Iron Crown ex',
    card_id_tcg: 'sv5m-91',
    set_name: 'Cyber Judge',
    set_code: 'sv5m',
    set_number: '091',
    rarity: 'RR',
    rarity_rank: 0,
    date_added: '2026-05-07T00:00:00Z',
    ...over,
  });
}

describe('normalize', () => {
  it('lowercases and strips accents', () => {
    expect(normalize('Mascarade Crépusculaire')).toBe('mascarade crepusculaire');
    expect(normalize('Évolutions à Paldea')).toBe('evolutions a paldea');
  });

  it('collapses whitespace', () => {
    expect(normalize('  Cyber   Judge  ')).toBe('cyber judge');
  });

  it('decodes HTML entities (&amp; → &)', () => {
    expect(normalize('Scarlet &amp; Violet Promos')).toBe('scarlet & violet promos');
    expect(normalize('Sun &amp; Moon')).toBe('sun & moon');
  });
});

describe('tokensSorted', () => {
  it('produces matching keys for word-reordered set names', () => {
    expect(tokensSorted('Festival Terastal ex')).toBe(tokensSorted('Terastal Festival ex'));
    expect(tokensSorted('Mascarade Crépusculaire')).not.toBe(tokensSorted('Twilight Masquerade'));
  });
});

describe('buildSearchPrefixes', () => {
  it('uses card_name as-is for plain EN cards', () => {
    const prefixes = buildSearchPrefixes(makeCard());
    expect(prefixes).toContain('Iron Crown ex');
  });

  it('adds reconstructed EN name (pokemon_name + suffix) for FR cards', () => {
    const prefixes = buildSearchPrefixes(
      makeCard({ language: 'FR', card_name: 'Couronne de Fer ex', pokemon_name: 'Iron Crown' }),
    );
    // Both the FR card_name (might match cognates) and the reconstructed EN form.
    expect(prefixes).toContain('Couronne de Fer ex');
    expect(prefixes).toContain('Iron Crown ex');
  });

  it('extracts both halves from "Translation (Original)" format', () => {
    const prefixes = buildSearchPrefixes(
      makeCard({ language: 'JP', card_name: 'Gruikui (チャオブー)', pokemon_name: 'Tepig' }),
    );
    expect(prefixes).toContain('Gruikui (チャオブー)');
    expect(prefixes).toContain('Gruikui');
    expect(prefixes).toContain('チャオブー');
    expect(prefixes).toContain('Tepig');
  });

  it('handles cards without a Pokemon suffix', () => {
    const prefixes = buildSearchPrefixes(makeCard({ card_name: 'Pikachu', pokemon_name: 'Pikachu' }));
    expect(prefixes).toContain('Pikachu');
  });

  it('falls back to card_name when pokemon_name is null (Trainers)', () => {
    const prefixes = buildSearchPrefixes(
      makeCard({ card_name: "N's Plan", pokemon_name: null, pokemon_number: null }),
    );
    expect(prefixes).toContain("N's Plan");
  });

  it('dedupes when card_name and pokemon_name+suffix are identical', () => {
    const prefixes = buildSearchPrefixes(makeCard({ card_name: 'Iron Crown ex', pokemon_name: 'Iron Crown' }));
    // "Iron Crown ex" appears twice in the construction (raw card_name + reconstructed) — dedupe to once.
    expect(prefixes.filter((p) => p === 'Iron Crown ex')).toHaveLength(1);
  });

  it('picks the higher-priced product for premium-tier (SAR/AR/SR full art)', () => {
    // Real example: Poltchageist in TM FR has 2 idProducts with same prefix —
    // 0.04€ Common and 2.77€ AR. Card.rarity='AR' must pick the 2.77€ one.
    const prices = [{ avg: 0.04 }, { avg: 2.77 }];
    expect(pickAmbiguousIndex(prices, null, 'AR')).toBe(1);
    expect(pickAmbiguousIndex(prices, null, 'SAR')).toBe(1);
    expect(pickAmbiguousIndex(prices, null, 'SR')).toBe(1);
  });

  it('picks the LOWER-priced product for RR (regular dual-rare ex/V print)', () => {
    // Real example: Venusaur EX in XY has 6€ regular RR and 70€ Full Art SR.
    // Card stored as RR ⇒ regular print ⇒ user wants the cheap one.
    const prices = [{ avg: 6.29 }, { avg: 69.32 }];
    expect(pickAmbiguousIndex(prices, null, 'RR')).toBe(0);
    expect(pickAmbiguousIndex(prices, null, 'CHR')).toBe(0);
    expect(pickAmbiguousIndex(prices, null, 'R_HOLO')).toBe(0);
  });

  it('picks the lower-priced product for Common/Uncommon base prints', () => {
    const prices = [{ avg: 0.04 }, { avg: 2.77 }];
    expect(pickAmbiguousIndex(prices, null, 'C')).toBe(0);
    expect(pickAmbiguousIndex(prices, null, 'UC')).toBe(0);
    expect(pickAmbiguousIndex(prices, null, null)).toBe(0);
  });

  it('reverse_holo always picks the higher price (overrides rarity)', () => {
    const prices = [{ avg: 0.04 }, { avg: 2.77 }];
    expect(pickAmbiguousIndex(prices, 'reverse_holo', 'C')).toBe(1);
  });

  it('handles null avg by excluding it from the wantHighest comparison', () => {
    const prices = [{ avg: null }, { avg: 1.5 }, { avg: null }];
    expect(pickAmbiguousIndex(prices, null, 'AR')).toBe(1); // 1.5 > -1
    expect(pickAmbiguousIndex(prices, null, 'C')).toBe(1); // 1.5 < Infinity
  });

  it('uses POKEMON_NAMES[pokemon_number].en when pokemon_name is localized (Reptincel → Charmeleon)', () => {
    const prefixes = buildSearchPrefixes(
      makeCard({
        language: 'JP',
        card_name: 'Reptincel (リザード)',
        pokemon_name: 'Reptincel', // Gemini-only fallback stored the FR name
        pokemon_number: 5, // Charmeleon
      }),
    );
    expect(prefixes).toContain('Charmeleon');
  });

  it('also reconstructs EN name + suffix via pokemon_number ("Aquali-ex" → "Vaporeon ex")', () => {
    const prefixes = buildSearchPrefixes(
      makeCard({
        language: 'JP',
        card_name: 'Aquali-ex (シャワーズex)',
        pokemon_name: 'Aquali',
        pokemon_number: 134, // Vaporeon
      }),
    );
    expect(prefixes).toContain('Vaporeon ex');
    expect(prefixes).toContain('Vaporeon');
  });

  it('normalizes the dash in -EX/-ex suffixes to a space (Cardmarket convention)', () => {
    const prefixes = buildSearchPrefixes(
      makeCard({ card_name: 'Slowbro-EX', pokemon_name: 'Slowbro' }),
    );
    expect(prefixes).toContain('Slowbro EX'); // dash-normalized
    // The original "Slowbro-EX" form is also kept in case a CM entry uses it.
    expect(prefixes).toContain('Slowbro-EX');
  });

  it('detects VMAX, VSTAR, GX suffixes', () => {
    expect(buildSearchPrefixes(makeCard({ card_name: 'Charizard VMAX', pokemon_name: 'Charizard' })))
      .toContain('Charizard VMAX');
    expect(buildSearchPrefixes(makeCard({ card_name: 'Pikachu VSTAR', pokemon_name: 'Pikachu' })))
      .toContain('Pikachu VSTAR');
    expect(buildSearchPrefixes(makeCard({ card_name: 'Mewtwo GX', pokemon_name: 'Mewtwo' })))
      .toContain('Mewtwo GX');
  });
});

describe('buildSyntheticCardmarketUrlPath', () => {
  it('builds a Search URL combining card prefix + expansion name', () => {
    expect(buildSyntheticCardmarketUrlPath('Cyber Judge', 'Iron Crown ex')).toBe(
      '/fr/Pokemon/Products/Search?searchString=Iron%20Crown%20ex%20Cyber%20Judge',
    );
  });

  it('URL-encodes special characters', () => {
    expect(buildSyntheticCardmarketUrlPath('Scarlet & Violet Promos', 'Pikachu')).toBe(
      '/fr/Pokemon/Products/Search?searchString=Pikachu%20Scarlet%20%26%20Violet%20Promos',
    );
  });

  it('preserves accented characters in the query (CM Search handles them)', () => {
    expect(buildSyntheticCardmarketUrlPath('Mascarade Crépusculaire', 'Poltchageist')).toBe(
      '/fr/Pokemon/Products/Search?searchString=Poltchageist%20Mascarade%20Cr%C3%A9pusculaire',
    );
  });
});

// ---------------------------------------------------------------------------
// Fast-fast path: respect existing cardmarket_id
// ---------------------------------------------------------------------------
//
// Regression test for the "promo printing swap" bug — when a card has a
// cardmarket_id stored (set by enrich at scan time, or by manual SQL
// correction after a bad pick), the lookup must trust that id rather than
// re-deriving by (set_name, set_number). The standard derivation breaks for
// promos where multiple consecutive id_products share the same set_number
// (e.g. 715758 and 715759 for two SV-Black-Star Carapuce printings):
// pickAmbiguousIndex would silently pick the cheaper one on every refresh.

interface PriceRow {
  id_product: number;
  low: number | null;
  trend: number | null;
  avg: number | null;
  low_holo: number | null;
  trend_holo: number | null;
  avg_holo: number | null;
}

interface IndexRow {
  id_product: number;
  url_path: string | null;
  set_number?: string;
  id_expansion?: number;
}

/**
 * Build a chainable Supabase mock that returns canned data per table. Only
 * implements the methods used by lookupCardmarketPricing — keep it small.
 */
function makeServiceMock(opts: {
  pricingByIdProduct?: Map<number, PriceRow>;
  cardIndexByIdProduct?: Map<number, IndexRow>;
  cardIndexBySetNumber?: Map<string, IndexRow[]>;
  expansions?: Array<{ id_expansion: number; name: string }>;
}): ServiceClient {
  const pricing = opts.pricingByIdProduct ?? new Map();
  const indexById = opts.cardIndexByIdProduct ?? new Map();
  const indexByNumber = opts.cardIndexBySetNumber ?? new Map();
  const expansions = opts.expansions ?? [];

  const from = vi.fn((table: string) => {
    if (table === 'cardmarket_pricing') {
      return {
        select: vi.fn(() => ({
          in: vi.fn((_col: string, ids: number[]) => {
            const data = ids.map((id) => pricing.get(id)).filter(Boolean) as PriceRow[];
            return Promise.resolve({ data, error: null });
          }),
        })),
      };
    }
    if (table === 'cardmarket_card_index') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn((_col: string, id: number) => ({
            maybeSingle: vi.fn(() => Promise.resolve({ data: indexById.get(id) ?? null, error: null })),
          })),
          in: vi.fn(() => ({
            eq: vi.fn((_col: string, num: string) => Promise.resolve({
              data: indexByNumber.get(num) ?? [],
              error: null,
            })),
          })),
        })),
      };
    }
    if (table === 'cardmarket_expansions') {
      return {
        select: vi.fn(() => Promise.resolve({ data: expansions, error: null })),
      };
    }
    if (table === 'cardmarket_products') {
      // Used only by maybeSynthesizeUrl when result.urlPath is still null.
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
          })),
        })),
      };
    }
    if (table === 'tcg_catalog') {
      // Hit by buildCandidateSetNames for additional set-name candidates.
      // Empty is the common case in unit tests that don't seed the catalog.
      return {
        select: vi.fn(() => ({
          ilike: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      };
    }
    throw new Error(`unexpected table in test: ${table}`);
  });

  return { from } as unknown as ServiceClient;
}

describe('lookupCardmarketPricing — fast-fast path (existing cardmarket_id)', () => {
  beforeEach(() => {
    _resetExpansionsCacheForTests();
  });

  afterEach(() => {
    _resetExpansionsCacheForTests();
    vi.clearAllMocks();
  });

  it('uses card.cardmarket_id directly without re-deriving by set_number', async () => {
    // The bug scenario: SV-Black-Star promo where set_number "001" maps to
    // both id_product 715758 (correct, the printing the user owns) and 715759
    // (a sibling printing). With the old code, pickAmbiguousIndex would pick
    // 715759 (cheaper) on refresh. With cardmarket_id="715758" stored, we
    // must read the price for THAT id and never visit the ambiguity-prone
    // set_number lookup.
    const service = makeServiceMock({
      pricingByIdProduct: new Map([
        [715758, { id_product: 715758, low: 5, trend: 8, avg: 7, low_holo: null, trend_holo: null, avg_holo: null }],
        // 715759 deliberately also priced — proves the lookup DIDN'T pick it.
        [715759, { id_product: 715759, low: 1, trend: 2, avg: 1.5, low_holo: null, trend_holo: null, avg_holo: null }],
      ]),
      cardIndexByIdProduct: new Map([
        [715758, { id_product: 715758, url_path: '/fr/Pokemon/Products/Singles/SV-Black-Star/Carapuce-V1' }],
      ]),
    });
    const card = baseMakeCard({
      cardmarket_id: '715758',
      variant: 'promo',
      set_name: 'SV-Black-Star Promos',
      set_number: '001',
      rarity: 'OTHER',
    });

    const result = await lookupCardmarketPricing(service, card);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.idProduct).toBe(715758);
    expect(result.avg).toBe(7);
    expect(result.ambiguous).toBe(false);
    expect(result.urlPath).toBe('/fr/Pokemon/Products/Singles/SV-Black-Star/Carapuce-V1');
  });

  it('falls through to standard lookup when stored cardmarket_id has no pricing row', async () => {
    // Stale id (e.g. product was re-indexed and the old id was dropped from
    // cardmarket_pricing). Must not return ok with no data — fall through so
    // the next path can try (and ultimately return a clean failure outcome).
    const service = makeServiceMock({
      pricingByIdProduct: new Map(), // empty: no pricing for the stored id
      expansions: [],                 // empty: standard path will then return no_expansion
    });
    const card = baseMakeCard({
      cardmarket_id: '999999', // stale
      set_name: 'Cyber Judge',
      set_number: '091',
    });

    const result = await lookupCardmarketPricing(service, card);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Standard lookup ran and reported the real failure (no_expansion in this
    // mock setup), proving the fast-fast path didn't short-circuit on empty.
    expect(result.reason).toBe('no_expansion');
  });

  it('ignores invalid cardmarket_id strings and falls through', async () => {
    const service = makeServiceMock({ expansions: [] });
    const card = baseMakeCard({
      cardmarket_id: 'not-a-number',
      set_name: 'Cyber Judge',
      set_number: '091',
    });

    const result = await lookupCardmarketPricing(service, card);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('no_expansion');
  });

  it('does not engage the fast path when cardmarket_id is null (regression: standard path still works)', async () => {
    const service = makeServiceMock({ expansions: [] });
    const card = baseMakeCard({ cardmarket_id: null, set_name: 'Cyber Judge', set_number: '091' });

    const result = await lookupCardmarketPricing(service, card);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('no_expansion');
  });
});
