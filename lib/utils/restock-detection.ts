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

export function computeRestockAlerts(
  cards: readonly {
    pokemon_number: number | null;
    pokemon_name: string | null;
    status: 'pokedex' | 'for_sale' | 'collection' | 'sold';
  }[],
): RestockAlert[] {
  const byPokemon = new Map<
    number,
    { pokedex: { pokemon_name: string } | null; for_sale: number; stock: number }
  >();
  for (const c of cards) {
    if (!c.pokemon_number) continue;
    const entry = byPokemon.get(c.pokemon_number) ?? { pokedex: null, for_sale: 0, stock: 0 };
    if (c.status === 'pokedex') entry.pokedex = { pokemon_name: c.pokemon_name ?? '?' };
    else if (c.status === 'for_sale') entry.for_sale += 1;
    else if (c.status === 'collection') entry.stock += 1;
    byPokemon.set(c.pokemon_number, entry);
  }
  return Array.from(byPokemon.entries())
    .map(([pokemon_number, { pokedex, for_sale, stock }]) =>
      detectRestock({
        pokemonNumber: pokemon_number,
        pokedexCard: pokedex,
        remainingForSaleCount: for_sale,
        remainingStockCount: stock,
      }),
    )
    .filter((a): a is RestockAlert => a !== null);
}
