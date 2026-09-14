import { describe, expect, it } from 'vitest';
import {
  CATALOG_SINGLE,
  BRAND_IDS,
  matchesSearch,
  matchesLotSearch,
  matchesLotFilters,
  matchesAttrFilters,
} from './vinted-list-filters';
import { makeCardWithListings, makeLotWithListings } from './test-fixtures';
import { INITIAL_FILTERS } from '@/components/vinted/VintedFilters';

describe('matchesSearch', () => {
  it('matches accent- and case-insensitively across card fields', () => {
    const card = makeCardWithListings({ card_name: 'Dracaufeu ex', pokemon_name: 'Dracaufeu' });
    expect(matchesSearch(card, 'dracaufeu')).toBe(true);
    expect(matchesSearch(card, 'DRACAUFEU')).toBe(true);
    expect(matchesSearch(card, 'mewtwo')).toBe(false);
  });

  it('returns true for an empty query', () => {
    expect(matchesSearch(makeCardWithListings(), '')).toBe(true);
  });
});

describe('matchesLotSearch', () => {
  it('matches against the lot name', () => {
    const lot = makeLotWithListings({ name: 'Lot Dresseurs SV' });
    expect(matchesLotSearch(lot, 'dresseurs')).toBe(true);
    expect(matchesLotSearch(lot, 'dracaufeu')).toBe(false);
  });
});

describe('matchesLotFilters', () => {
  it('keeps only singles when kindFilter=single', () => {
    const single = makeLotWithListings({ catalog_id: CATALOG_SINGLE });
    const lot = makeLotWithListings({ catalog_id: 1 });
    const f = { ...INITIAL_FILTERS, kindFilter: 'single' as const };
    expect(matchesLotFilters(single, f)).toBe(true);
    expect(matchesLotFilters(lot, f)).toBe(false);
  });

  it('keeps only lots when kindFilter=lot', () => {
    const single = makeLotWithListings({ catalog_id: CATALOG_SINGLE });
    const f = { ...INITIAL_FILTERS, kindFilter: 'lot' as const };
    expect(matchesLotFilters(single, f)).toBe(false);
  });

  it('filters by brand', () => {
    const pokemonLot = makeLotWithListings({ brand_id: BRAND_IDS.pokemon });
    const onePieceLot = makeLotWithListings({ brand_id: BRAND_IDS.onepiece });
    const f = { ...INITIAL_FILTERS, lotBrand: 'onepiece' as const };
    expect(matchesLotFilters(onePieceLot, f)).toBe(true);
    expect(matchesLotFilters(pokemonLot, f)).toBe(false);
  });

  it('"autres" excludes every known brand id, including null (treated as Pokémon)', () => {
    const unknownBrand = makeLotWithListings({ brand_id: 999999 });
    const nullBrand = makeLotWithListings({ brand_id: null });
    const f = { ...INITIAL_FILTERS, lotBrand: 'autres' as const };
    expect(matchesLotFilters(unknownBrand, f)).toBe(true);
    expect(matchesLotFilters(nullBrand, f)).toBe(false);
  });
});

describe('matchesAttrFilters', () => {
  it('filters by language, rarity and variant', () => {
    const card = makeCardWithListings({ language: 'JP', rarity: 'SAR', variant: 'reverse_holo' });
    expect(matchesAttrFilters(card, { ...INITIAL_FILTERS, language: 'JP' })).toBe(true);
    expect(matchesAttrFilters(card, { ...INITIAL_FILTERS, language: 'EN' })).toBe(false);
    expect(matchesAttrFilters(card, { ...INITIAL_FILTERS, rarity: 'SAR' })).toBe(true);
    expect(matchesAttrFilters(card, { ...INITIAL_FILTERS, variant: 'reverse_holo' })).toBe(true);
    expect(matchesAttrFilters(card, { ...INITIAL_FILTERS, variant: 'standard' })).toBe(false);
  });

  it('treats a null variant as "standard"', () => {
    const card = makeCardWithListings({ variant: null });
    expect(matchesAttrFilters(card, { ...INITIAL_FILTERS, variant: 'standard' })).toBe(true);
  });
});
