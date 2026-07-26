/**
 * Rebuilds the game state from tokenized events.
 *
 * This is what separates a coach from a replay viewer. Without exact state —
 * which card was in hand, what was in play, what was in the discard — you can
 * only narrate what happened. With it, you can say what was playable and wasn't.
 *
 * Two genuine difficulties, both handled here:
 *  1. Duplicate cards are indistinguishable in the log. "evolved Héricendre into
 *     Feurisson" never says which of the three. Disambiguated by the rules of the
 *     game; whatever ambiguity survives is recorded rather than hidden.
 *  2. The log misreports ownership on damage counters. Targets are always
 *     resolved against the board, never against the announced name.
 */

import type {
  PtcgCardRef,
  PtcgGameState,
  PtcgPlayerState,
  PtcgPokemonState,
  PtcgSnapshot,
  PtcgTurnIndex,
} from '@/lib/types';
import type { PtcgEvent, PtcgTokenizeResult } from './tokenize';

export interface PtcgAmbiguity {
  line: number;
  kind: string;
  card: string;
  candidates: number;
  chosen?: number;
}

export interface PtcgWarning {
  line: number;
  kind: string;
  card?: string;
  player?: string;
}

export interface PtcgBuildResult {
  players: [string, string];
  snapshots: PtcgSnapshot[];
  turns: PtcgTurnIndex[];
  ambiguities: PtcgAmbiguity[];
  warnings: PtcgWarning[];
  final: PtcgGameState;
}

type ResolveIntent = 'evolve' | 'damage' | null;

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

export function buildStates(tokens: PtcgTokenizeResult): PtcgBuildResult {
  const [p1, p2] = tokens.players;
  let nextUid = 1;

  const newPokemon = (
    card: PtcgCardRef,
    owner: string,
    zone: 'active' | 'bench',
    turn: number,
  ): PtcgPokemonState => ({
    uid: nextUid++,
    cardId: card.id,
    name: card.name,
    owner,
    zone,
    damage: 0,
    attached: [],
    stack: [],
    placedTurn: turn,
    evolvedTurn: null,
  });

  const mkPlayer = (): PtcgPlayerState => ({
    active: null,
    bench: [],
    hand: [],
    unknownHand: 0,
    discard: [],
    prizesRemaining: 6,
  });

  const state: PtcgGameState = {
    turnNumber: 0,
    activePlayer: null,
    stadium: null,
    winner: null,
    players: { [p1]: mkPlayer(), [p2]: mkPlayer() },
  };

  const ambiguities: PtcgAmbiguity[] = [];
  const warnings: PtcgWarning[] = [];
  const snapshots: PtcgSnapshot[] = [];
  const turns: PtcgTurnIndex[] = [];

  const P = (n: string) => state.players[n];
  const other = (n: string) => (n === p1 ? p2 : p1);
  const inPlay = (n: string) => [P(n).active, ...P(n).bench].filter(Boolean) as PtcgPokemonState[];

  /** Works out which instance a card reference points at. */
  function resolve(
    playerName: string,
    ref: PtcgCardRef,
    opts: { zone?: string; intent?: ResolveIntent; line?: number } = {},
  ): PtcgPokemonState | null {
    const { zone = undefined, intent = null, line = 0 } = opts;
    let candidates = inPlay(playerName).filter((k) => k.cardId === ref.id);

    if (zone === 'Banc') candidates = candidates.filter((k) => k.zone === 'bench');
    if (zone === 'Poste Actif') candidates = candidates.filter((k) => k.zone === 'active');

    if (candidates.length === 0) {
      // The log sometimes names the wrong side; try the other player.
      const cross = inPlay(other(playerName)).filter((k) => k.cardId === ref.id);
      if (cross.length >= 1) {
        warnings.push({ line, kind: 'wrong-owner', card: ref.name, player: playerName });
        return cross[0];
      }
      warnings.push({ line, kind: 'target-not-found', card: ref.name, player: playerName });
      return null;
    }

    if (candidates.length === 1) return candidates[0];

    if (intent === 'evolve') {
      // A Pokémon played this turn, or already evolved this turn, cannot evolve.
      const eligible = candidates.filter(
        (k) => k.placedTurn < state.turnNumber && k.evolvedTurn !== state.turnNumber,
      );
      if (eligible.length === 1) return eligible[0];
      if (eligible.length > 1) {
        eligible.sort((a, b) => a.placedTurn - b.placedTurn || a.uid - b.uid);
        ambiguities.push({
          line,
          kind: 'evolution',
          card: ref.name,
          candidates: eligible.length,
          chosen: eligible[0].uid,
        });
        return eligible[0];
      }
      warnings.push({ line, kind: 'evolution-no-eligible-candidate', card: ref.name });
      return candidates[0];
    }

    if (intent === 'damage') {
      // Attacks hit the Active; bench effects usually finish off the hurt one.
      const hurt = [...candidates].sort((a, b) => b.damage - a.damage);
      ambiguities.push({
        line,
        kind: 'damage-target',
        card: ref.name,
        candidates: candidates.length,
        chosen: hurt[0].uid,
      });
      return hurt[0];
    }

    ambiguities.push({
      line,
      kind: intent ?? 'unknown',
      card: ref.name,
      candidates: candidates.length,
    });
    return candidates[0];
  }

  /** Removes a card from the known hand, else decrements the hidden count. */
  function takeFromHand(playerName: string, ref: PtcgCardRef): PtcgCardRef {
    const h = P(playerName).hand;
    const i = h.findIndex((c) => c.id === ref.id);
    if (i >= 0) return h.splice(i, 1)[0];
    if (P(playerName).unknownHand > 0) P(playerName).unknownHand--;
    return { id: ref.id, name: ref.name };
  }

  /**
   * Sends a knocked-out Pokémon and everything it carried to the discard.
   *
   * Done in one go rather than trusting the log's own discard list, which is
   * inconsistent (listed after some knockouts, absent after others). The list,
   * when present, is used by validate.ts as a cross-check instead.
   */
  function destroy(k: PtcgPokemonState): PtcgCardRef[] {
    const pl = P(k.owner);
    const cards = [...k.stack, { id: k.cardId, name: k.name }, ...k.attached];
    pl.discard.push(...cards);
    if (pl.active === k) pl.active = null;
    pl.bench = pl.bench.filter((b) => b !== k);
    return cards;
  }

  function applyEvolve(ev: PtcgEvent) {
    const from = ev.from as PtcgCardRef;
    const to = ev.to as PtcgCardRef;
    const k = resolve(ev.player as string, from, {
      zone: ev.zone as string,
      intent: 'evolve',
      line: ev.line,
    });
    if (!k) return;
    takeFromHand(ev.player as string, to);
    k.stack.push({ id: k.cardId, name: k.name });
    k.cardId = to.id;
    k.name = to.name;
    k.evolvedTurn = state.turnNumber;
  }

  /**
   * Damage counters: the announced owner is unreliable, so the target is found
   * on the board. A player never places counters on their own Pokémon via an
   * attack, which is the tell that identifies the misreported case.
   */
  function resolveDamageTarget(ev: PtcgEvent): PtcgPokemonState | null {
    const claimed = ev.claimedOwner as string;
    const target = ev.target as PtcgCardRef;
    const sameSide = inPlay(claimed).filter((x) => x.cardId === target.id);

    let k: PtcgPokemonState | null;
    if (sameSide.length > 1) {
      k = resolve(claimed, target, { intent: 'damage', line: ev.line });
    } else if (sameSide.length === 1) {
      k = sameSide[0];
    } else {
      // Nobody of that name on the claimed side — the log named the wrong owner.
      // Recorded rather than silently fixed: an override that leaves no trace is
      // indistinguishable from a parser bug when a later claim rests on it.
      warnings.push({ line: ev.line, kind: 'owner-corrected', card: target.name });
      k = resolve(other(claimed), target, { intent: 'damage', line: ev.line });
    }

    if (k && k.owner === ev.player) {
      const opp = resolve(other(ev.player as string), target, { intent: 'damage', line: ev.line });
      if (opp) {
        warnings.push({ line: ev.line, kind: 'owner-corrected', card: target.name });
        k = opp;
      }
    }
    return k;
  }

  function applySub(ev: PtcgEvent, parent: PtcgEvent) {
    const pl = ev.player ? P(ev.player as string) : null;

    switch (ev.type) {
      case 'opening-hand-count': {
        const owner = P(parent.player as string);
        if (ev.cards?.length) owner.hand.push(...ev.cards);
        else owner.unknownHand += ev.count as number;
        break;
      }

      case 'draw-known':
        pl!.hand.push(ev.card as PtcgCardRef);
        break;

      case 'draw-hidden':
        if (ev.cards?.length) pl!.hand.push(...ev.cards);
        else pl!.unknownHand += ev.count as number;
        break;

      case 'bench-from-deck':
        for (const c of ev.cards ?? []) {
          pl!.bench.push(newPokemon(c, ev.player as string, 'bench', state.turnNumber));
        }
        break;

      case 'discard-from-hand': {
        // Under an attack or ability, "discarded" is ambiguous: it can be an
        // attached energy (attack cost) or a card from hand (ability cost).
        // Verified on Shuriken Mortel: it is the hand. Attached cards are only
        // touched when the hand demonstrably cannot supply the card — the
        // knockout oracle then cross-checks the energy count.
        if ((parent.type === 'use' || parent.type === 'attack') && ev.cards?.length) {
          const src = resolve(parent.player as string, parent.source as PtcgCardRef, {
            line: ev.line,
          });
          for (const c of ev.cards) {
            const i = pl!.hand.findIndex((h) => h.id === c.id);
            if (i >= 0) {
              pl!.discard.push(...pl!.hand.splice(i, 1));
              continue;
            }
            if (pl!.unknownHand > 0) {
              pl!.unknownHand--;
              pl!.discard.push(c);
              continue;
            }
            const j = src ? src.attached.findIndex((a) => a.id === c.id) : -1;
            if (j >= 0) pl!.discard.push(...src!.attached.splice(j, 1));
            else pl!.discard.push(c);
          }
          break;
        }
        if (parent.type === 'play-stadium') break; // the outgoing stadium

        if (ev.cards?.length) {
          for (const c of ev.cards) pl!.discard.push(takeFromHand(ev.player as string, c));
        } else {
          for (let i = 0; i < (ev.count as number); i++) if (pl!.unknownHand > 0) pl!.unknownHand--;
        }
        break;
      }

      case 'evolve':
        applyEvolve(ev);
        break;

      case 'place-damage': {
        const k = resolveDamageTarget(ev);
        if (k) k.damage += (ev.counters as number) * 10;
        break;
      }

      case 'move-to-hand': {
        const card = ev.card as PtcgCardRef;
        for (const k of inPlay(ev.player as string)) {
          const i = k.attached.findIndex((a) => a.id === card.id);
          if (i >= 0) {
            pl!.hand.push(...k.attached.splice(i, 1));
            return;
          }
        }
        const i = pl!.discard.findIndex((c) => c.id === card.id);
        if (i >= 0) pl!.hand.push(...pl!.discard.splice(i, 1));
        else pl!.hand.push(card);
        break;
      }

      case 'discard-opponent-hand': {
        // Hand disruption. `ev.player` is whose hand is hit, not who played it.
        // These cards land in the discard like any other, so anything scaling
        // on the discard pile counts them.
        const victim = P(ev.player as string);
        if (ev.cards?.length) {
          for (const c of ev.cards) victim.discard.push(takeFromHand(ev.player as string, c));
        } else {
          for (let i = 0; i < (ev.count as number); i++) {
            if (victim.unknownHand > 0) victim.unknownHand--;
          }
        }
        break;
      }

      case 'discard-attached':
        break; // already handled by the preceding knockout; used by validate.ts

      // A card that attaches several energies resolves each one under itself
      // (Gypso). Same effect as a top-level attach — leaving it out under-counts
      // what is in play, which the knockout oracle reports as a discard short by
      // exactly the energies that were never applied.
      case 'attach': {
        const k = resolve(ev.player as string, ev.target as PtcgCardRef, {
          zone: ev.zone as string,
          line: ev.line,
        });
        if (k) k.attached.push(takeFromHand(ev.player as string, ev.card as PtcgCardRef));
        break;
      }

      case 'shuffle-into-deck':
        // Hand first, discard second. Most cards that shuffle into the deck
        // take the hand (Détermination de Lilie and friends); only a few take
        // the discard (Cendre Sacrée). Searching the discard first silently
        // removed a card that was in fact in hand, which then under-counted
        // every attack scaling on the discard pile — caught by the oracle.
        for (const c of ev.cards ?? []) {
          const i = pl!.hand.findIndex((d) => d.id === c.id);
          if (i >= 0) {
            pl!.hand.splice(i, 1);
            continue;
          }
          const j = pl!.discard.findIndex((d) => d.id === c.id);
          if (j >= 0) pl!.discard.splice(j, 1);
        }
        break;

      case 'hand-to-deck': {
        const owner = P(ev.player as string);
        if (ev.cards?.length) for (const c of ev.cards) takeFromHand(ev.player as string, c);
        else owner.hand = [];
        owner.unknownHand = 0;
        break;
      }

      case 'swap-active': {
        const owner = ev.player as string;
        const incoming = resolve(owner, ev.incoming as PtcgCardRef, { line: ev.line });
        const outgoing = resolve(owner, ev.outgoing as PtcgCardRef, { line: ev.line });
        if (incoming && outgoing) {
          const pp = P(owner);
          pp.bench = pp.bench.filter((b) => b !== incoming);
          if (pp.active === outgoing) {
            outgoing.zone = 'bench';
            pp.bench.push(outgoing);
          }
          incoming.zone = 'active';
          pp.active = incoming;
        }
        break;
      }

      default:
        break; // shuffles, prize reshuffles: no effect on what we model
    }
  }

  function applyMain(ev: PtcgEvent) {
    const pl = ev.player ? P(ev.player as string) : null;

    switch (ev.type) {
      case 'turn-start':
        state.turnNumber++;
        state.activePlayer = ev.player as string;
        turns.push({ number: state.turnNumber, player: ev.player as string, events: [] });
        break;

      case 'play-pokemon': {
        const card = ev.card as PtcgCardRef;
        takeFromHand(ev.player as string, card);
        const zone = ev.zone === 'Banc' ? 'bench' : 'active';
        const k = newPokemon(card, ev.player as string, zone, state.turnNumber);
        if (zone === 'active') pl!.active = k;
        else pl!.bench.push(k);
        break;
      }

      case 'play-stadium': {
        const card = ev.card as PtcgCardRef;
        takeFromHand(ev.player as string, card);
        if (state.stadium) P(state.stadium.owner).discard.push(state.stadium.card);
        state.stadium = { card, owner: ev.player as string };
        break;
      }

      case 'play-trainer':
        pl!.discard.push(takeFromHand(ev.player as string, ev.card as PtcgCardRef));
        break;

      case 'draw-known':
        pl!.hand.push(ev.card as PtcgCardRef);
        break;

      case 'draw-hidden':
        pl!.unknownHand += ev.count as number;
        break;

      case 'evolve':
        applyEvolve(ev);
        break;

      case 'attach': {
        const k = resolve(ev.player as string, ev.target as PtcgCardRef, {
          zone: ev.zone as string,
          line: ev.line,
        });
        const card = takeFromHand(ev.player as string, ev.card as PtcgCardRef);
        if (k) k.attached.push(card);
        break;
      }

      case 'retreat': {
        const k = resolve(ev.player as string, ev.card as PtcgCardRef, { line: ev.line });
        if (k && pl!.active === k) {
          k.zone = 'bench';
          pl!.bench.push(k);
          pl!.active = null;
        }
        break;
      }

      case 'promote': {
        const card = ev.card as PtcgCardRef;

        // "X est maintenant sur le Poste Actif" also follows a retreat or a
        // Boss's Orders that already moved X up. Treating that confirmation as
        // a fresh promotion re-resolves the name, and with several copies in
        // play it can pick a different one — demoting the Pokémon that was
        // actually dragged up. That is how a Boss's Orders on one of three
        // Zacian-ex ended with the wrong one active, and the wrong cards in
        // the discard two knockouts later.
        if (pl!.active?.cardId === card.id) break;

        const k =
          pl!.bench.find((b) => b.cardId === card.id) ??
          resolve(ev.player as string, card, { line: ev.line });
        if (k) {
          pl!.bench = pl!.bench.filter((b) => b !== k);
          if (pl!.active && pl!.active !== k) {
            pl!.active.zone = 'bench';
            pl!.bench.push(pl!.active);
          }
          k.zone = 'active';
          pl!.active = k;
        }
        break;
      }

      case 'attack': {
        const tgt = resolve(ev.targetPlayer as string, ev.target as PtcgCardRef, {
          intent: 'damage',
          line: ev.line,
        });
        if (tgt) tgt.damage += ev.damage as number;
        break;
      }

      case 'ko': {
        const k = resolve(ev.player as string, ev.card as PtcgCardRef, {
          intent: 'damage',
          line: ev.line,
        });
        if (k) ev.discarded = destroy(k);
        break;
      }

      case 'take-prize':
        pl!.prizesRemaining -= ev.count as number;
        break;

      case 'prize-to-hand':
        if (ev.card) pl!.hand.push(ev.card as PtcgCardRef);
        else pl!.unknownHand++;
        break;

      case 'game-end':
        state.winner = ev.winner as string;
        break;

      default:
        break;
    }
  }

  for (const ev of tokens.events) {
    applyMain(ev);
    for (const child of ev.children ?? []) applySub(child, ev);

    snapshots.push({
      line: ev.line,
      turnNumber: state.turnNumber,
      event: ev as unknown as Record<string, unknown>,
      state: clone(state),
    });
    if (turns.length) turns[turns.length - 1].events.push(snapshots.length - 1);
  }

  return { players: tokens.players, snapshots, turns, ambiguities, warnings, final: clone(state) };
}
