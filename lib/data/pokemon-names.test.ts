import { describe, expect, it } from 'vitest';
import { POKEMON_NAMES, getPokemonName, findPokemonNumberByName } from './pokemon-names';

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

describe('findPokemonNumberByName', () => {
  it('finds a French name with accents', () => {
    expect(findPokemonNumberByName('Salamèche')).toBe(4);
    expect(findPokemonNumberByName('Tortank')).toBe(9);
  });

  it('finds an English name', () => {
    expect(findPokemonNumberByName('Charizard')).toBe(6);
    expect(findPokemonNumberByName('Pikachu')).toBe(25);
  });

  it('extracts the name from a Vinted-style title with extra context', () => {
    // Real Vinted titles look like "Carte Pokémon <FR_NAME> - <Set Name> (CODE NUM) [LANG]"
    expect(findPokemonNumberByName('Carte Pokémon Scalproie - Black Bolt (SV11B 148) [JP]')).toBe(625);
    expect(findPokemonNumberByName('Carte Pokémon Dracaufeu ex - Pokémon 151 (SV2a 6) [JP]')).toBe(6);
  });

  it('returns null when no Pokémon name appears', () => {
    expect(findPokemonNumberByName('Trainer card energy lightning')).toBeNull();
    expect(findPokemonNumberByName('')).toBeNull();
  });

  it('picks the longest match when multiple names appear (evolution lines)', () => {
    // "Dardargnan" (15, 10 chars) is longer than "Aspicot" (13, 7 chars) — picks 15.
    const result = findPokemonNumberByName('Lot Aspicot Dardargnan');
    expect(result).toBe(15);
  });

  it('is case-insensitive and tolerates hyphens/parens around names', () => {
    expect(findPokemonNumberByName('PIKACHU')).toBe(25);
    expect(findPokemonNumberByName('(Pikachu) - VMAX')).toBe(25);
  });
});
