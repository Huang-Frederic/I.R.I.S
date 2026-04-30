import { describe, expect, it } from 'vitest';
import { POKEMON_NAMES, getPokemonName } from './pokemon-names';

describe('POKEMON_NAMES dataset', () => {
  it('contains entries for all 1025 Pokémon', () => {
    expect(Object.keys(POKEMON_NAMES)).toHaveLength(1025);
    expect(POKEMON_NAMES[1]).toBeDefined();
    expect(POKEMON_NAMES[1025]).toBeDefined();
  });

  it('has French and English names for known Pokémon', () => {
    expect(POKEMON_NAMES[25]).toEqual({ fr: 'Pikachu', en: 'Pikachu' });
    expect(POKEMON_NAMES[1].fr).toBe('Bulbizarre');
    expect(POKEMON_NAMES[1].en).toBe('Bulbasaur');
    expect(POKEMON_NAMES[6].fr).toBe('Dracaufeu');
    expect(POKEMON_NAMES[6].en).toBe('Charizard');
  });
});

describe('getPokemonName', () => {
  it('returns the French name by default', () => {
    expect(getPokemonName(1)).toBe('Bulbizarre');
    expect(getPokemonName(150)).toBe('Mewtwo');
  });

  it('returns English when lang=en', () => {
    expect(getPokemonName(1, 'en')).toBe('Bulbasaur');
    expect(getPokemonName(150, 'en')).toBe('Mewtwo');
  });

  it('returns ??? for unknown numbers', () => {
    expect(getPokemonName(0)).toBe('???');
    expect(getPokemonName(9999)).toBe('???');
  });
});
