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

  it('returns the full dex, in ascending dex order, for an empty or whitespace query', () => {
    const results = searchPokemon('');
    expect(results).toHaveLength(1025);
    expect(results[0]).toEqual({ number: 1, fr: 'Bulbizarre', en: 'Bulbasaur' });
    expect(results[1024].number).toBe(1025);
    expect(searchPokemon('   ')).toHaveLength(1025);
  });

  it('returns an empty array when nothing matches a non-empty query', () => {
    expect(searchPokemon('zzzznotapokemon')).toEqual([]);
  });

  it('caps results at the given limit', () => {
    const results = searchPokemon('a', 3);
    expect(results).toHaveLength(3);
    expect(searchPokemon('', 5)).toHaveLength(5);
  });
});
