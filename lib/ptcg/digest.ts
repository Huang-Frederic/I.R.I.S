/**
 * Compresses a reconstructed game into what the analysis step actually needs.
 *
 * The full snapshot list is ~500 KB and almost entirely redundant. What cannot
 * be recovered downstream is `available`: what was *possible* at each turn and
 * did not happen. Re-deriving that without redoing the whole reconstruction is
 * how an analysis ends up confidently wrong.
 *
 * Everything here is fact, not judgement. "This once-per-turn ability was never
 * triggered" is computed; "that was the mistake that lost the game" is not.
 */

import type {
  PtcgAvailability,
  PtcgCardRow,
  PtcgDigest,
  PtcgDigestTurn,
  PtcgGameState,
  PtcgPokemonState,
  PtcgSnapshot,
} from '@/lib/types';
import { eventLabel } from '@/lib/utils/ptcg-event-label';
import { canPayCost, energyPool } from './energy-cost';
import type { PtcgParsedGame } from './index';

/** Abilities usable once per turn — the ones worth reporting as skipped. */
const ONCE_PER_TURN = /une fois pendant votre tour/i;

/**
 * An ability whose text carries a precondition. Being untriggered proves
 * nothing about these — Favianos-ex's "Renverser la Tendance" only works after
 * one of your Pokémon was knocked out, so it shows up as "unused" on every
 * quiet turn. Flagged rather than dropped: the condition may well have held.
 */
const CONDITIONAL = /\bsi\b|\bs['’]il\b|\blorsque\b|\bà condition\b/i;

const inPlay = (s: PtcgGameState, player: string): PtcgPokemonState[] =>
  [s.players[player].active, ...s.players[player].bench].filter(Boolean) as PtcgPokemonState[];

/**
 * Once-per-turn abilities that were in play during the turn and never fired.
 *
 * Scanned across every snapshot of the turn rather than at its end, because a
 * Pokémon can leave play mid-turn by evolving. That is exactly the case worth
 * catching: two Feurisson on board, one ability used, then one of them evolves
 * into Typhlosion — at end of turn the missed opportunity is invisible.
 *
 * Opportunities are keyed by uid *and* card id, since uid survives evolution
 * while the ability belongs to the card.
 */
function unusedAbilities(
  snaps: PtcgSnapshot[],
  player: string,
  cards: Record<string, PtcgCardRow>,
): PtcgAvailability['unusedAbilities'] {
  const opportunities = new Map<string, PtcgAvailability['unusedAbilities'][number]>();

  for (const s of snaps) {
    for (const k of inPlay(s.state, player)) {
      for (const a of cards[k.cardId]?.abilities ?? []) {
        if (!a.effect || !ONCE_PER_TURN.test(a.effect)) continue;
        opportunities.set(`${k.uid}:${k.cardId}:${a.name}`, {
          uid: k.uid,
          card: cards[k.cardId]?.name ?? k.name,
          ability: a.name,
          effect: a.effect,
          conditional: CONDITIONAL.test(a.effect),
        });
      }
    }
  }

  // One `use` event consumes one opportunity for the matching card + ability.
  for (const s of snaps) {
    const ev = s.event as Record<string, unknown>;
    if (ev.type !== 'use' || ev.player !== player) continue;
    const src = ev.source as { id: string } | undefined;
    const move = ev.move as string;
    const key = [...opportunities.keys()].find((k) => {
      const [, cardId, ability] = k.split(':');
      return cardId === src?.id && ability === move;
    });
    if (key) opportunities.delete(key);
  }

  return [...opportunities.values()];
}

/**
 * The best attack whose damage is a plain number, against the opposing Active.
 *
 * Deliberately null whenever the number cannot be trusted: a "40+" formula, or
 * any stadium in play (stadiums modify HP — Montagne Gravité takes 30 off every
 * Stage 2). A wrong "you could have knocked it out" is worse than no answer, so
 * uncertainty is reported as absence rather than as an estimate.
 */
function damageIfAttackNow(
  state: PtcgGameState,
  player: string,
  opponent: string,
  cards: Record<string, PtcgCardRow>,
): PtcgAvailability['damageIfAttackNow'] {
  if (state.stadium) return null;
  const mine = state.players[player].active;
  const theirs = state.players[opponent].active;
  if (!mine || !theirs) return null;

  const targetCard = cards[theirs.cardId];
  if (!targetCard?.hp) return null;

  // Only attacks whose cost is actually attached. Without this the biggest
  // attack on the card was reported whatever was in play, so a Pokémon with no
  // energy still advertised damage — and an analysis reading that would accuse
  // the player of passing up a hit they could not have made.
  const pool = energyPool(mine.attached, cards);
  if (pool === null) return null;

  const best = (cards[mine.cardId]?.attacks ?? [])
    .filter((a) => canPayCost(a.cost, pool))
    .map((a) => ({ move: a.name, total: Number(a.damage) }))
    .filter((a) => Number.isInteger(a.total) && a.total > 0)
    .sort((a, b) => b.total - a.total)[0];
  if (!best) return null;

  return {
    move: best.move,
    total: best.total,
    targetEffectiveHp: targetCard.hp,
    targetDamage: theirs.damage,
  };
}

function availability(
  snaps: PtcgSnapshot[],
  player: string,
  opponent: string,
  cards: Record<string, PtcgCardRow>,
): PtcgAvailability {
  const events = snaps.map((s) => s.event as Record<string, unknown>);
  const end = snaps[snaps.length - 1].state;

  // Everything that passed through the hand at any point in the turn, not just
  // the opening hand: "you could have played X" holds if X was ever holdable,
  // and most turns draw the card that mattered after they begin.
  const held = new Set<string>();
  for (const s of snaps) for (const c of s.state.players[player].hand) held.add(c.name);

  const supporterPlayed = events.some(
    (e) =>
      e.type === 'play-trainer' &&
      e.player === player &&
      cards[(e.card as { id: string }).id]?.trainer_type === 'Supporter',
  );
  const energyAttached = events.some(
    (e) =>
      e.type === 'attach' &&
      e.player === player &&
      cards[(e.card as { id: string }).id]?.category === 'Énergie',
  );

  return {
    unusedAbilities: unusedAbilities(snaps, player, cards),
    playableFromHand: [...held],
    supporterPlayed,
    energyAttached,
    damageIfAttackNow: damageIfAttackNow(end, player, opponent, cards),
  };
}

export function buildDigest(
  parsed: PtcgParsedGame,
  cards: Record<string, PtcgCardRow>,
  meta: { gameId: string; playedAt: string },
): PtcgDigest {
  const { me, opponent } = parsed;
  const snapshots = parsed.state.snapshots;

  const turns: PtcgDigestTurn[] = parsed.state.turns.map((t) => {
    const snaps = t.events.map((i) => snapshots[i]);
    const owner = t.player ?? me;
    return {
      n: t.number,
      player: owner === me ? 'me' : 'opponent',
      start: snaps[0].state,
      actions: snaps.map((s) => ({
        line: s.line,
        label: eventLabel(s.event as Record<string, unknown>, me, opponent),
      })),
      end: snaps[snaps.length - 1].state,
      available: availability(snaps, owner, owner === me ? opponent : me, cards),
    };
  });

  return {
    meta: {
      gameId: meta.gameId,
      playedAt: meta.playedAt,
      me,
      opponent,
      winner: parsed.winner,
      prizesTaken: { me: parsed.prizesMe, opponent: parsed.prizesOpponent },
      turns: parsed.turns,
    },
    cards,
    turns,
    validationOk: parsed.validation.ok,
  };
}
