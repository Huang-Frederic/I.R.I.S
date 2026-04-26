import { describe, expect, it } from 'vitest';
import { extractPokemonName, mapRarity } from './tcgapi';

describe('mapRarity', () => {
  it('maps known TCG API rarities to the card_rarity enum', () => {
    expect(mapRarity('Special Illustration Rare')).toBe('SAR');
    expect(mapRarity('Illustration Rare')).toBe('AR');
    expect(mapRarity('Ultra Rare')).toBe('SR');
    expect(mapRarity('Double Rare')).toBe('RR');
    expect(mapRarity('Rare Holo')).toBe('R_HOLO');
    expect(mapRarity('Rare')).toBe('R');
    expect(mapRarity('Uncommon')).toBe('UC');
    expect(mapRarity('Common')).toBe('C');
  });

  it('falls back to OTHER for unknown or missing rarities', () => {
    expect(mapRarity('Some New Rarity Type')).toBe('OTHER');
    expect(mapRarity(undefined)).toBe('OTHER');
    expect(mapRarity('')).toBe('OTHER');
  });

  it('maps Hyper Rare to SAR (treated as a tier-9 rarity)', () => {
    expect(mapRarity('Hyper Rare')).toBe('SAR');
  });
});

describe('extractPokemonName', () => {
  it('strips the ex / EX / V / VMAX / VSTAR suffixes', () => {
    expect(extractPokemonName('Charizard ex')).toBe('Charizard');
    expect(extractPokemonName('Pikachu V')).toBe('Pikachu');
    expect(extractPokemonName('Mewtwo VMAX')).toBe('Mewtwo');
    expect(extractPokemonName('Arceus VSTAR')).toBe('Arceus');
    expect(extractPokemonName('Mew GX')).toBe('Mew');
  });

  it('leaves plain species names untouched', () => {
    expect(extractPokemonName('Lapras')).toBe('Lapras');
    expect(extractPokemonName('Snorlax')).toBe('Snorlax');
  });

  it('only strips the suffix when it is at the end of the name', () => {
    // "Mr. Mime" doesn't have a suffix, but "ex" appears nowhere — should be untouched.
    expect(extractPokemonName('Mr. Mime')).toBe('Mr. Mime');
  });
});
