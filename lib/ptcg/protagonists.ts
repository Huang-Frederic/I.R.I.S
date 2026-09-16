/**
 * Identifies the Pokémon that actually carried each side of a game.
 *
 * Used to give a game a face in the history: up to 2 cards per side, so a
 * combo deck (e.g. "Alakazam / Dudunsparce") shows both, not just one. It
 * also feeds the archetype-dex fields on ptcg_games — see
 * lib/ptcg/archetype-dex.ts.
 *
 * The rule is total damage dealt, not stage or rarity: the protagonists of a
 * game are whatever did the work. Summing by card id also survives evolution
 * correctly — a Feurisson that chips for 40 then becomes the Typhlosion that
 * deals 1200 counts as two different cards, and the Typhlosion wins.
 */

import type { PtcgSnapshot } from '@/lib/types';

export interface PtcgProtagonist {
  cardId: string;
  name: string;
  /** Total damage this card dealt across the game. 0 when picked by fallback. */
  damageDealt: number;
}

/**
 * @param snapshots the game's reconstruction
 * @param player    whose protagonists to find
 * @returns up to 2 Pokémon that dealt damage, highest first; if none did, a
 *   single Pokémon that spent the most time Active (a game can end before
 *   anyone attacks); if the player never had anything in play, an empty array.
 */
export function keyPokemons(snapshots: PtcgSnapshot[], player: string): PtcgProtagonist[] {
  const damage = new Map<string, { name: string; total: number }>();
  const activeTurns = new Map<string, { name: string; count: number }>();

  for (const snap of snapshots) {
    const ev = snap.event as Record<string, unknown>;
    if (ev.type === 'attack' && ev.player === player) {
      const src = ev.source as { id: string; name: string };
      const acc = damage.get(src.id) ?? { name: src.name, total: 0 };
      acc.total += (ev.damage as number) ?? 0;
      damage.set(src.id, acc);
    }

    // Fallback tally — a game can end before anyone attacks.
    const active = snap.state.players[player]?.active;
    if (active) {
      const acc = activeTurns.get(active.cardId) ?? { name: active.name, count: 0 };
      acc.count += 1;
      activeTurns.set(active.cardId, acc);
    }
  }

  const byDamage = [...damage]
    .filter(([, v]) => v.total > 0)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 2)
    .map(([cardId, v]) => ({ cardId, name: v.name, damageDealt: v.total }));
  if (byDamage.length > 0) return byDamage;

  // Nobody dealt damage — name the single Pokémon that spent the most time
  // Active. Only one: with no damage signal at all, a second guess would be
  // noise, not a second protagonist.
  const topActive = [...activeTurns].sort((a, b) => b[1].count - a[1].count)[0];
  if (topActive) return [{ cardId: topActive[0], name: topActive[1].name, damageDealt: 0 }];

  return [];
}
