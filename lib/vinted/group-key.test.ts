import { describe, expect, it } from 'vitest';
import { groupKeyFor } from './group-key';

describe('groupKeyFor', () => {
  it('groups a card as "Pokémon {language}"', () => {
    expect(groupKeyFor({ cardId: 'c1', language: 'FR', brandId: null })).toBe('Pokémon FR');
    expect(groupKeyFor({ cardId: 'c1', language: 'JP', brandId: null })).toBe('Pokémon JP');
  });

  it('groups a lot with a null brand id as "Pokémon" (no language — lots have none)', () => {
    expect(groupKeyFor({ cardId: null, language: null, brandId: null })).toBe('Pokémon');
  });

  it('groups a lot with the explicit Pokémon brand id (191646) as "Pokémon"', () => {
    expect(groupKeyFor({ cardId: null, language: null, brandId: 191646 })).toBe('Pokémon');
  });

  it('groups a lot with another known brand id by its BRAND_LABELS name', () => {
    expect(groupKeyFor({ cardId: null, language: null, brandId: 509120 })).toBe('Riftbound');
    expect(groupKeyFor({ cardId: null, language: null, brandId: 399547 })).toBe('Magic');
  });

  it('falls back to "Autres" for an unrecognized brand id', () => {
    expect(groupKeyFor({ cardId: null, language: null, brandId: 999999 })).toBe('Autres');
  });
});
