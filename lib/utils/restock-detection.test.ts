// lib/utils/restock-detection.test.ts
import { describe, expect, it } from 'vitest';
import { detectRestock, computeRestockAlerts } from './restock-detection';

describe('detectRestock', () => {
  it('returns restock info when pokedex exists and no for_sale + no stock remain', () => {
    const result = detectRestock({
      pokemonNumber: 25,
      pokedexCard: { pokemon_name: 'Pikachu' },
      remainingForSaleCount: 0,
      remainingStockCount: 0,
    });
    expect(result).toEqual({ pokemon_number: 25, pokemon_name: 'Pikachu' });
  });

  it('returns null when no pokedex card exists for that pokemon', () => {
    const result = detectRestock({
      pokemonNumber: 25,
      pokedexCard: null,
      remainingForSaleCount: 0,
      remainingStockCount: 0,
    });
    expect(result).toBeNull();
  });

  it('returns null when other for_sale cards remain', () => {
    const result = detectRestock({
      pokemonNumber: 25,
      pokedexCard: { pokemon_name: 'Pikachu' },
      remainingForSaleCount: 2,
      remainingStockCount: 0,
    });
    expect(result).toBeNull();
  });

  it('returns null when stock copies still exist (user can promote one)', () => {
    const result = detectRestock({
      pokemonNumber: 25,
      pokedexCard: { pokemon_name: 'Pikachu' },
      remainingForSaleCount: 0,
      remainingStockCount: 2,
    });
    expect(result).toBeNull();
  });

  it('returns null when both pokedex and inventory miss', () => {
    expect(
      detectRestock({
        pokemonNumber: 25,
        pokedexCard: null,
        remainingForSaleCount: 5,
        remainingStockCount: 0,
      }),
    ).toBeNull();
  });
});

describe('computeRestockAlerts', () => {
  it('aggregates by pokemon_number and returns alerts only where applicable', () => {
    const result = computeRestockAlerts([
      { pokemon_number: 25, pokemon_name: 'Pikachu', status: 'pokedex' },
      { pokemon_number: 25, pokemon_name: 'Pikachu', status: 'for_sale' },
      { pokemon_number: 6, pokemon_name: 'Charizard', status: 'pokedex' },
      { pokemon_number: 9, pokemon_name: 'Blastoise', status: 'pokedex' },
      { pokemon_number: 9, pokemon_name: 'Blastoise', status: 'collection' },
    ]);
    expect(result.map((a) => a.pokemon_number)).toEqual([6]);
  });

  it('skips cards with null pokemon_number', () => {
    const result = computeRestockAlerts([
      { pokemon_number: null, pokemon_name: null, status: 'pokedex' },
    ]);
    expect(result).toEqual([]);
  });
});
