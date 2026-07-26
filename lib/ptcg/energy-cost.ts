/**
 * Whether an attack's energy cost is actually payable right now.
 *
 * Split out of the digest because getting it wrong is expensive in a specific
 * way: `damageIfAttackNow` used to report the card's biggest attack regardless
 * of what was attached, so a Héricendre with no energy still advertised
 * "Flammèche, 30 damage". An analysis reading that would accuse the player of
 * passing up damage they could not have dealt.
 */

import type { PtcgCardRef, PtcgCardRow } from '@/lib/types';

/** The Colorless symbol, as TCGdex spells it in French. */
const COLORLESS = 'Incolore';

/**
 * The types each attached energy can provide, or null when that cannot be
 * determined — an unresolved card, or an energy whose types are missing.
 *
 * Null is not "no energy": it means the answer is unknowable, and every caller
 * should fall silent rather than guess. Tools are skipped; they share the
 * `attached` list but pay for nothing.
 */
export function energyPool(
  attached: PtcgCardRef[],
  cards: Record<string, PtcgCardRow>,
): string[][] | null {
  const pool: string[][] = [];
  for (const a of attached) {
    const card = cards[a.id];
    if (!card) return null;
    if (card.category !== 'Énergie') continue;
    if (!card.types?.length) return null;
    pool.push(card.types);
  }
  return pool;
}

/**
 * @param cost one symbol per entry, e.g. `['Feu', 'Feu', 'Incolore']`
 * @param pool from {@link energyPool}
 */
export function canPayCost(cost: string[], pool: string[][]): boolean {
  const typed = cost.filter((c) => c !== COLORLESS);
  const colorless = cost.length - typed.length;

  const used = new Set<number>();
  for (const need of typed) {
    // Spend the least flexible energy that fits, so a multi-type energy stays
    // available for a requirement only it can cover. Picking the first match
    // would fail cases that are in fact payable.
    let best = -1;
    for (let i = 0; i < pool.length; i++) {
      if (used.has(i) || !pool[i].includes(need)) continue;
      if (best < 0 || pool[i].length < pool[best].length) best = i;
    }
    if (best < 0) return false;
    used.add(best);
  }

  return pool.length - used.size >= colorless;
}
