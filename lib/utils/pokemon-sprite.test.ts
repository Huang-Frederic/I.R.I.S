import { describe, expect, it } from 'vitest';
import { slugifyPokemonName, pokemonSpriteUrl } from './pokemon-sprite';

describe('slugifyPokemonName', () => {
  it('lowercases a simple name', () => {
    expect(slugifyPokemonName('Bulbasaur')).toBe('bulbasaur');
  });

  it('joins a space-separated name with a hyphen', () => {
    expect(slugifyPokemonName('Great Tusk')).toBe('great-tusk');
  });

  it('drops the period and joins the title', () => {
    expect(slugifyPokemonName('Mr. Mime')).toBe('mr-mime');
    expect(slugifyPokemonName('Mime Jr.')).toBe('mime-jr');
  });

  it('drops curly and straight apostrophes', () => {
    expect(slugifyPokemonName('Farfetch’d')).toBe('farfetchd');
    expect(slugifyPokemonName("Farfetch'd")).toBe('farfetchd');
  });

  it('spells out the gender symbols', () => {
    expect(slugifyPokemonName('Nidoran♀')).toBe('nidoran-f');
    expect(slugifyPokemonName('Nidoran♂')).toBe('nidoran-m');
  });

  it('strips accents', () => {
    expect(slugifyPokemonName('Flabébé')).toBe('flabebe');
  });

  it('turns a colon into a hyphen', () => {
    expect(slugifyPokemonName('Type: Null')).toBe('type-null');
  });

  it('keeps an already-hyphenated name as-is (lowercased)', () => {
    expect(slugifyPokemonName('Ho-Oh')).toBe('ho-oh');
    expect(slugifyPokemonName('Porygon-Z')).toBe('porygon-z');
  });
});

describe('pokemonSpriteUrl', () => {
  it('builds the LimitlessTCG sprite URL for a known dex number', () => {
    expect(pokemonSpriteUrl(1)).toBe('https://r2.limitlesstcg.net/pokemon/gen9/bulbasaur.png');
    expect(pokemonSpriteUrl(122)).toBe('https://r2.limitlesstcg.net/pokemon/gen9/mr-mime.png');
  });

  it('returns null for a number outside the dex', () => {
    expect(pokemonSpriteUrl(0)).toBeNull();
    expect(pokemonSpriteUrl(1026)).toBeNull();
  });
});
