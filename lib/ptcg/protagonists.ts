/**
 * Identifies the Pokémon that actually carried each side of a game.
 *
 * Used to give a game a face in the history: two cards, one per player, with
 * the score between them. It also fills `my_archetype` / `opponent_archetype`,
 * which otherwise fall back to the player's handle — "Bklee219" tells you
 * nothing about what you played against, "Méga-Amphinobi-ex" tells you
 * everything.
 *
 * The rule is total damage dealt, not stage or rarity: the protagonist of a
 * game is whatever did the work. Summing by card id also survives evolution
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
 * @param player    whose protagonist to find
 */
export function keyPokemon(snapshots: PtcgSnapshot[], player: string): PtcgProtagonist | null {
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

  const topDamage = [...damage].sort((a, b) => b[1].total - a[1].total)[0];
  if (topDamage && topDamage[1].total > 0) {
    return { cardId: topDamage[0], name: topDamage[1].name, damageDealt: topDamage[1].total };
  }

  // Nobody dealt damage — name the Pokémon that spent the most time Active.
  const topActive = [...activeTurns].sort((a, b) => b[1].count - a[1].count)[0];
  if (topActive) {
    return { cardId: topActive[0], name: topActive[1].name, damageDealt: 0 };
  }

  return null;
}
