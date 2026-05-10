import { describe, it, expect } from 'vitest';
import {
  displayPokemonName,
  displayCardName,
  displaySetName,
} from './format-name';

describe('displayPokemonName', () => {
  it('returns canonical when ocr is null', () => {
    expect(
      displayPokemonName({ pokemon_name: 'Dracaufeu', pokemon_name_ocr: null }),
    ).toBe('Dracaufeu');
  });

  it('returns canonical when ocr equals canonical (case/diacritics tolerant)', () => {
    expect(
      displayPokemonName({ pokemon_name: 'Dracaufeu', pokemon_name_ocr: 'DRACAUFEU' }),
    ).toBe('Dracaufeu');
    expect(
      displayPokemonName({ pokemon_name: 'Pichu', pokemon_name_ocr: 'pichu' }),
    ).toBe('Pichu');
  });

  it('appends ocr in parentheses when divergent', () => {
    expect(
      displayPokemonName({ pokemon_name: 'Dracaufeu', pokemon_name_ocr: 'Charizard' }),
    ).toBe('Dracaufeu (Charizard)');
    expect(
      displayPokemonName({ pokemon_name: 'Dracaufeu', pokemon_name_ocr: 'リザードン' }),
    ).toBe('Dracaufeu (リザードン)');
  });

  it('returns empty string when both are null', () => {
    expect(displayPokemonName({ pokemon_name: null, pokemon_name_ocr: null })).toBe('');
  });
});

describe('displayCardName', () => {
  it('returns canonical when ocr is null', () => {
    expect(
      displayCardName({ card_name: 'Dracaufeu ex', card_name_ocr: null }),
    ).toBe('Dracaufeu ex');
  });

  it('appends ocr when divergent', () => {
    expect(
      displayCardName({ card_name: 'Dracaufeu ex', card_name_ocr: 'Charizard ex' }),
    ).toBe('Dracaufeu ex (Charizard ex)');
  });
});

describe('displaySetName', () => {
  it('returns set_name as-is regardless of language', () => {
    expect(displaySetName({ set_name: 'Brilliant Stars' })).toBe('Brilliant Stars');
    expect(displaySetName({ set_name: 'Crimson Haze' })).toBe('Crimson Haze');
  });

  it('returns empty string when set_name is null', () => {
    expect(displaySetName({ set_name: null })).toBe('');
  });
});
