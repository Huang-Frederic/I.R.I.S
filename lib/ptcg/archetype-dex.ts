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
  return keyPokemons(snapshots, player)
    .map((p) => dexNumberFromCardName(p.name))
    .filter((n): n is number => n !== null);
}
