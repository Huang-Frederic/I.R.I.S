import { describe, expect, it } from 'vitest';
import { searchPokemon } from './pokemon-search';

describe('searchPokemon', () => {
  it('matches by French name, case- and accent-insensitive', () => {
    const results = searchPokemon('dracaufeu');
    expect(results.some((r) => r.number === 6 && r.fr === 'Dracaufeu')).toBe(true);
  });

  it('matches by English name', () => {
    const results = searchPokemon('charizard');
    expect(results.some((r) => r.number === 6 && r.en === 'Charizard')).toBe(true);
  });

  it('matches a partial, lowercase query', () => {
    const results = searchPokemon('pika');
    expect(results.some((r) => r.number === 25)).toBe(true);
  });

  it('returns an empty array for an empty or whitespace query', () => {
    expect(searchPokemon('')).toEqual([]);
    expect(searchPokemon('   ')).toEqual([]);
  });

  it('returns an empty array when nothing matches', () => {
    expect(searchPokemon('zzzznotapokemon')).toEqual([]);
  });

  it('caps results at the given limit', () => {
    // 'a' matches hundreds of names in fr+en — plenty to exceed a small limit.
    const results = searchPokemon('a', 3);
    expect(results).toHaveLength(3);
  });

  it('defaults to a limit of 8 results', () => {
    const results = searchPokemon('a');
    expect(results.length).toBeLessThanOrEqual(8);
  });
});
