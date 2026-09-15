import { POKEMON_NAMES } from '@/lib/data/pokemon-names';
import { normalizeForSearch } from './text-normalize';

export interface PokemonSearchResult {
  number: number;
  fr: string;
  en: string;
}

/** Searches POKEMON_NAMES by French or English name, accent- and
 *  case-insensitive substring match. Object.entries on POKEMON_NAMES yields
 *  ascending dex-number order (integer-like keys), so results come back
 *  lowest-number-first. */
export function searchPokemon(query: string, limit = 8): PokemonSearchResult[] {
  const q = normalizeForSearch(query.trim());
  if (!q) return [];

  const results: PokemonSearchResult[] = [];
  for (const [numStr, entry] of Object.entries(POKEMON_NAMES)) {
    if (normalizeForSearch(entry.fr).includes(q) || normalizeForSearch(entry.en).includes(q)) {
      results.push({ number: Number(numStr), fr: entry.fr, en: entry.en });
      if (results.length >= limit) break;
    }
  }
  return results;
}
