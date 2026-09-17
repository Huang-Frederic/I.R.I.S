import { describe, expect, it } from 'vitest';
import { POKEMON_NAMES, getPokemonName, encodeMegaDex, decodeMegaDex } from './pokemon-names';

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

  it('prefixes a Mega form with "Méga"/"Mega" in the requested language', () => {
    expect(getPokemonName(encodeMegaDex(658))).toBe('Méga Amphinobi');
    expect(getPokemonName(encodeMegaDex(658), 'en')).toBe('Mega Greninja');
  });

  it('suffixes the dual-form variant letter for Mega X/Y', () => {
    expect(getPokemonName(encodeMegaDex(6, 'x'), 'en')).toBe('Mega Charizard X');
    expect(getPokemonName(encodeMegaDex(6, 'y'), 'en')).toBe('Mega Charizard Y');
  });
});

describe('encodeMegaDex / decodeMegaDex', () => {
  it('round-trips a single-form Mega', () => {
    expect(decodeMegaDex(encodeMegaDex(658))).toEqual({ dex: 658, suffix: 'mega' });
  });

  it('round-trips the X and Y dual-form variants', () => {
    expect(decodeMegaDex(encodeMegaDex(6, 'x'))).toEqual({ dex: 6, suffix: 'mega-x' });
    expect(decodeMegaDex(encodeMegaDex(6, 'y'))).toEqual({ dex: 6, suffix: 'mega-y' });
  });

  it('decodes a plain (non-Mega) dex number to a null suffix', () => {
    expect(decodeMegaDex(658)).toEqual({ dex: 658, suffix: null });
  });
});
