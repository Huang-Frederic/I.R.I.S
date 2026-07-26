/**
 * Whether a "search your deck for X" ability can still find anything.
 *
 * `unusedAbilities` reports a fact — the ability was available and not used —
 * but for a search ability that fact is only half the story. Once every copy of
 * what it looks for is out of the deck, triggering it does nothing, and calling
 * that a missed opportunity is a false accusation.
 *
 * It happened: a coach flagged "you evolved without using Unis par le Voyage"
 * on three separate turns of a game where all four Aventure de Luth had been in
 * the discard since turn four. The advice would have wasted a click every game.
 *
 * The bound is sound rather than clever. A deck holds at most four copies of a
 * card, so once four are visible outside the deck, both the deck and the prizes
 * hold none. Anything less than four is not evidence either way — the rest
 * could be in the prizes — so only a definite "nothing left" is reported.
 */

import type { PtcgCardRow, PtcgGameState } from '@/lib/types';

/** Deck-building limit per card name. Basic Energy is exempt, hence the guard. */
const COPIES_ALLOWED = 4;

const mentionsDeck = /\bdeck\b/i;

/** Every copy of `cardId` the player can see: hand, discard, in play, evolutions underneath. */
export function copiesOutsideDeck(state: PtcgGameState, player: string, cardId: string): number {
  const pl = state.players[player];
  if (!pl) return 0;

  let n = 0;
  for (const c of pl.hand) if (c.id === cardId) n++;
  for (const c of pl.discard) if (c.id === cardId) n++;
  for (const k of [pl.active, ...pl.bench]) {
    if (!k) continue;
    if (k.cardId === cardId) n++;
    for (const c of k.stack) if (c.id === cardId) n++;
    for (const c of k.attached) if (c.id === cardId) n++;
  }
  return n;
}

/**
 * Names the card a search ability looks for, or null.
 *
 * Matched against the real card names in this game rather than parsed out of
 * the sentence: the effect text says "cherchez dans votre deck une carte
 * Aventure de Luth", and "Aventure de Luth" is a name we already hold. Exact
 * containment, so no grammar to get wrong.
 */
export function searchTarget(
  effect: string,
  cards: Record<string, PtcgCardRow>,
): { id: string; name: string } | null {
  if (!mentionsDeck.test(effect)) return null;

  // Longest name first: "Aventure de Luth" must win over a hypothetical "Luth".
  const named = Object.values(cards)
    .filter((c) => c.category !== 'Énergie')
    .sort((a, b) => b.name.length - a.name.length);

  for (const c of named) {
    if (effect.includes(c.name)) return { id: c.ptcgl_id, name: c.name };
  }
  return null;
}

/**
 * True only when the search provably cannot succeed. Never a guess: an ability
 * that searches for something broader than one named card returns false, and
 * the analysis is left to judge it as before.
 */
export function searchExhausted(
  effect: string,
  state: PtcgGameState,
  player: string,
  cards: Record<string, PtcgCardRow>,
): boolean {
  const target = searchTarget(effect, cards);
  if (!target) return false;
  return copiesOutsideDeck(state, player, target.id) >= COPIES_ALLOWED;
}
