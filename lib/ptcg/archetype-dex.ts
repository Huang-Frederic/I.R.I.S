/**
 * The single entry point for "which Pokémon represent this side of this
 * game" — used both to suggest sprites right after parsing a fresh log (no
 * override exists yet) and to display an already-saved game (an override may
 * exist, from a manual correction via the Create/Edit Log modal).
 */
import type { PtcgSnapshot } from '@/lib/types';
import { keyPokemons } from './protagonists';
import { dexNumberFromCardName } from '@/lib/utils/pokemon-sprite';
import { decodeMegaDex } from '@/lib/data/pokemon-names';

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
  // its Mega Evolution "Méga-Amphinobi-ex") are kept as separate protagonists
  // by keyPokemons (it sums damage per card id), but they're still one
  // distinct species for sprite purposes — dedupe by base dex (decoding any
  // Mega encoding first), preferring the Mega-encoded entry when both a base
  // and a Mega form of the same species occur, since Mega Evolving mid-game
  // is a strict upgrade and the Mega sprite is the more representative one.
  const bySpecies = new Map<number, number>();
  for (const n of dexNumbers) {
    const { dex } = decodeMegaDex(n);
    const existing = bySpecies.get(dex);
    if (existing === undefined || decodeMegaDex(existing).suffix === null) {
      bySpecies.set(dex, n);
    }
  }
  return [...bySpecies.values()];
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
