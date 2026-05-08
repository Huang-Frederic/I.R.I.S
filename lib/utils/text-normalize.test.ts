import { describe, expect, it } from 'vitest';
import { normalizeForSearch } from './text-normalize';

describe('normalizeForSearch', () => {
  it('strips diacritics and lowercases', () => {
    expect(normalizeForSearch('Pokédex')).toBe('pokedex');
    expect(normalizeForSearch('Évolutions à Paldea')).toBe('evolutions a paldea');
    expect(normalizeForSearch('Mascarade Crépusculaire')).toBe('mascarade crepusculaire');
  });

  it('passes through ASCII unchanged (apart from case)', () => {
    expect(normalizeForSearch('Pikachu')).toBe('pikachu');
    expect(normalizeForSearch('SV5M-091')).toBe('sv5m-091');
  });

  it('handles empty + whitespace', () => {
    expect(normalizeForSearch('')).toBe('');
    expect(normalizeForSearch('   ')).toBe('   ');
  });
});
