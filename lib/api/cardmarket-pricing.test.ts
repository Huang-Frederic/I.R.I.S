import { describe, expect, it } from 'vitest';
import { buildSearchPrefixes, normalize, pickAmbiguousIndex, tokensSorted } from './cardmarket-pricing';
import type { Card } from '@/lib/types';

function makeCard(over: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    pokemon_name: 'Iron Crown',
    pokemon_number: 1006,
    card_name: 'Iron Crown ex',
    card_id_tcg: 'sv5m-91',
    set_name: 'Cyber Judge',
    set_code: 'sv5m',
    set_number: '091',
    language: 'EN',
    rarity: 'RR',
    rarity_rank: 0,
    condition: 'NM',
    status: 'for_sale',
    image_url: null,
    tcg_image_url: null,
    cardmarket_id: null,
    cardmarket_url: null,
    cm_price_low: null,
    cm_price_trend: null,
    cm_price_avg: null,
    suggested_price: null,
    cm_updated_at: null,
    lot_id: null,
    date_added: '2026-05-07T00:00:00Z',
    date_sold: null,
    sold_price: null,
    sold_by_user_id: null,
    notes: null,
    variant: null,
    ...over,
  };
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
