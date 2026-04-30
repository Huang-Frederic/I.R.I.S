// lib/utils/restock-detection.test.ts
import { describe, expect, it } from 'vitest';
import { detectRestock } from './restock-detection';

describe('detectRestock', () => {
  it('returns restock info when pokedex exists and no for_sale remains', () => {
    const result = detectRestock({
      pokemonNumber: 25,
      pokedexCard: { pokemon_name: 'Pikachu' },
      remainingForSaleCount: 0,
    });
    expect(result).toEqual({ pokemon_number: 25, pokemon_name: 'Pikachu' });
  });

  it('returns null when no pokedex card exists for that pokemon', () => {
    const result = detectRestock({
      pokemonNumber: 25,
      pokedexCard: null,
      remainingForSaleCount: 0,
    });
    expect(result).toBeNull();
  });

  it('returns null when other for_sale cards remain', () => {
    const result = detectRestock({
      pokemonNumber: 25,
      pokedexCard: { pokemon_name: 'Pikachu' },
      remainingForSaleCount: 2,
    });
    expect(result).toBeNull();
  });

  it('returns null when both conditions miss', () => {
    expect(
      detectRestock({
        pokemonNumber: 25,
        pokedexCard: null,
        remainingForSaleCount: 5,
      }),
    ).toBeNull();
  });
});
