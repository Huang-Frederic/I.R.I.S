/**
 * The single entry point for "which Pokémon represent this side of this
 * game" — used both to suggest sprites right after parsing a fresh log (no
 * override exists yet) and to display an already-saved game (an override may
 * exist, from a manual correction via the Create/Edit Log modal).
 */
import type { PtcgSnapshot } from '@/lib/types';
import { keyPokemons } from './protagonists';
import { dexNumberFromCardName } from '@/lib/utils/pokemon-sprite';

/**
 * @param override national dex numbers the user explicitly set (`ptcg_games
 *   .my_archetype_dex` / `.opponent_archetype_dex`), or `null` when unset.
 *   An override — including an empty array — always wins over live derivation.
 */
export function resolveArchetypeDex(
  snapshots: PtcgSnapshot[],
  player: string,
  override: number[] | null,
): number[] {
  if (override !== null) return override;
  const dexNumbers = keyPokemons(snapshots, player)
    .map((p) => dexNumberFromCardName(p.name))
    .filter((n): n is number => n !== null);
  // Different evolution stages of the same species (e.g. "Amphinobi-ex" and
  // "Méga-Amphinobi-ex") are kept as separate protagonists by keyPokemons
  // (it sums damage per card id), but both resolve to the same national dex
  // number. For sprite purposes that's one distinct species, so dedupe here
  // — keeping the first (highest-damage, since keyPokemons sorts descending)
  // occurrence of each dex number.
  return [...new Set(dexNumbers)];
}

/**
 * Canonical grouping key for a set of archetype dex numbers — two archetypes
 * are "the same" when their dex-number SETS are equal regardless of order
 * (e.g. [157, 156] and [156, 157] group together). An empty array yields the
 * empty string: the key for the "unclassified" bucket (no override set yet,
 * or a deliberate empty-array override).
 */
export function archetypeKey(dex: number[]): string {
  return [...dex].sort((a, b) => a - b).join(',');
}
