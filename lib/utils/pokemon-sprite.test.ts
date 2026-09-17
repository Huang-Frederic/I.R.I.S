import { describe, expect, it } from 'vitest';
import { slugifyPokemonName, pokemonSpriteUrl, dexNumberFromCardName } from './pokemon-sprite';
import { encodeMegaDex } from '@/lib/data/pokemon-names';

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

  it('builds the single-form Mega sprite URL for a Mega-encoded number', () => {
    expect(pokemonSpriteUrl(encodeMegaDex(658))).toBe(
      'https://r2.limitlesstcg.net/pokemon/gen9/greninja-mega.png',
    );
  });

  it('builds the X/Y dual-form Mega sprite URL for Charizard', () => {
    expect(pokemonSpriteUrl(encodeMegaDex(6, 'x'))).toBe(
      'https://r2.limitlesstcg.net/pokemon/gen9/charizard-mega-x.png',
    );
    expect(pokemonSpriteUrl(encodeMegaDex(6, 'y'))).toBe(
      'https://r2.limitlesstcg.net/pokemon/gen9/charizard-mega-y.png',
    );
  });
});

describe('dexNumberFromCardName', () => {
  it('matches a plain species name', () => {
    expect(dexNumberFromCardName('Typhlosion de Luth')).toBe(157);
  });

  it('matches a species name that is a SUFFIX of the card name', () => {
    expect(dexNumberFromCardName('Feurisson de Luth')).toBe(156);
    expect(dexNumberFromCardName('Héricendre de Luth')).toBe(155);
  });

  it('encodes a Méga-prefixed card as its species dex Mega form, not the base form', () => {
    // A Mega card shares its base species' dex number, so returning that
    // number unencoded would be indistinguishable from the base card and
    // would render the wrong (base) sprite — see encodeMegaDex.
    expect(dexNumberFromCardName('Méga-Amphinobi-ex')).toBe(encodeMegaDex(658));
    expect(dexNumberFromCardName('Méga-Minotaupe-ex')).toBe(encodeMegaDex(530));
  });

  it('encodes the X/Y dual-form variant when the card name carries it', () => {
    expect(dexNumberFromCardName('Méga-Dracaufeu-X-ex')).toBe(encodeMegaDex(6, 'x'));
    expect(dexNumberFromCardName('Méga-Dracaufeu-Y-ex')).toBe(encodeMegaDex(6, 'y'));
  });

  it('matches the plain card without the Méga- decoration', () => {
    expect(dexNumberFromCardName('Amphinobi-ex')).toBe(658);
  });

  it('returns null for a name matching no Pokémon', () => {
    expect(dexNumberFromCardName('Not A Real Pokemon Card')).toBeNull();
  });
});
