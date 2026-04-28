// lib/api/tcg-catalog.test.ts
import { describe, expect, it } from 'vitest';
import { rowToEnrichedCard, disambiguateByName, type CatalogRow } from './tcg-catalog';

const baseRow: CatalogRow = {
  id: '00000000-0000-0000-0000-000000000001',
  cardmarket_id: '12345',
  set_code: 'SV11W',
  set_number: '012',
  set_total: 86,
  language: 'JP',
  card_name: 'チャオブー',
  pokemon_name: 'チャオブー',
  pokemon_number: 499,
  set_name: 'Battle Partners',
  rarity: 'C',
  image_url: 'https://product-images.s3.cardmarket.com/12345.jpg',
  scraped_at: '2026-04-28T12:00:00Z',
};

describe('rowToEnrichedCard', () => {
  it('maps a catalog row into the EnrichedCard shape used by the form', () => {
    const enriched = rowToEnrichedCard(baseRow);
    expect(enriched).toEqual({
      card_id_tcg: 'SV11W-012',
      card_name: 'チャオブー',
      pokemon_name: 'チャオブー',
      pokemon_number: 499,
      set_name: 'Battle Partners',
      set_code: 'SV11W',
      set_number: '012/86',
      rarity: 'C',
      tcg_image_url: 'https://product-images.s3.cardmarket.com/12345.jpg',
      cardmarket_id: '12345',
      cm_price_low: null,
      cm_price_trend: null,
      cm_price_avg: null,
    });
  });

  it('omits set_total when null', () => {
    const enriched = rowToEnrichedCard({ ...baseRow, set_total: null });
    expect(enriched.set_number).toBe('012');
  });

  it('falls back to OTHER rarity when null', () => {
    const enriched = rowToEnrichedCard({ ...baseRow, rarity: null });
    expect(enriched.rarity).toBe('OTHER');
  });
});

describe('disambiguateByName', () => {
  const a: CatalogRow = { ...baseRow, set_code: 'M3', card_name: 'ビビヨン', pokemon_name: 'ビビヨン' };
  const b: CatalogRow = { ...baseRow, set_code: 'BW5', card_name: 'ホウオウEX', pokemon_name: 'ホウオウ' };
  const c: CatalogRow = { ...baseRow, set_code: 'SM8b', card_name: 'レントラー', pokemon_name: 'レントラー' };

  it('returns the single name match when OCR text contains exactly one card name', () => {
    const ocr = '... ホウオウEX HP 160 ...';
    const result = disambiguateByName([a, b, c], ocr);
    expect(result.best).toBe(b);
    expect(result.candidates).toEqual([b]);
  });

  it('returns the matching subset when OCR text matches multiple names', () => {
    const ocr = '... ビビヨン ... レントラー ...';
    const result = disambiguateByName([a, b, c], ocr);
    expect(result.candidates).toEqual([a, c]);
    expect(result.best).toBe(a);
  });

  it('returns all candidates when no name matches OCR text', () => {
    const ocr = '... ピカチュウ ...';
    const result = disambiguateByName([a, b, c], ocr);
    expect(result.candidates).toEqual([a, b, c]);
    expect(result.best).toBe(a);
  });

  it('returns null/empty when given no candidates', () => {
    expect(disambiguateByName([], 'any text')).toEqual({ best: null, candidates: [] });
  });

  it('matches by pokemon_name when card_name has a suffix the OCR misses', () => {
    // Cardmarket card_name "Charizard ex" but OCR may only have read "Charizard"
    const charizardEx: CatalogRow = {
      ...baseRow,
      set_code: 'SVI',
      card_name: 'Charizard ex',
      pokemon_name: 'Charizard',
    };
    const pikachu: CatalogRow = {
      ...baseRow,
      set_code: 'SVI',
      card_name: 'Pikachu V',
      pokemon_name: 'Pikachu',
    };
    const ocr = '... Charizard HP 330 ...';
    const result = disambiguateByName([charizardEx, pikachu], ocr);
    expect(result.best).toBe(charizardEx);
    expect(result.candidates).toEqual([charizardEx]);
  });
});
