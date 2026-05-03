// lib/utils/restock-detection.ts

export interface RestockAlert {
  pokemon_number: number;
  pokemon_name: string;
}

export interface DetectRestockInput {
  pokemonNumber: number;
  /** The Pokédex slot for this pokemon, or null if empty. Only `pokemon_name` is used. */
  pokedexCard: { pokemon_name: string } | null;
  /** How many for_sale cards remain for this pokemon AFTER the sale just made. */
  remainingForSaleCount: number;
  /** How many `collection` (Stock) cards remain — if > 0 the user can refill from stock so no alert. */
  remainingStockCount: number;
}

/**
 * Decide whether a sale should trigger a "restock" alert.
 *
 * Triggered when ALL three:
 *   1. There is a Pokédex card registered for this pokemon_number.
 *   2. No for_sale card remains for that pokemon_number.
 *   3. No Stock copy exists either — otherwise the user can promote a stock
 *      card to for_sale, so the Pokédex slot is not actually exposed.
 *
 * Pure function — caller does the DB queries and passes the data in.
 */
export function detectRestock(input: DetectRestockInput): RestockAlert | null {
  if (!input.pokedexCard) return null;
  if (input.remainingForSaleCount > 0) return null;
  if (input.remainingStockCount > 0) return null;
  return {
    pokemon_number: input.pokemonNumber,
    pokemon_name: input.pokedexCard.pokemon_name,
  };
}
