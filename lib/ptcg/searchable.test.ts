import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PtcgCardRow, PtcgGameState } from '@/lib/types';
import { parseGame } from './index';
import { copiesOutsideDeck, searchExhausted, searchTarget } from './searchable';

const card = (id: string, name: string, over: Partial<PtcgCardRow> = {}): PtcgCardRow =>
  ({ ptcgl_id: id, name, category: 'Dresseur', ...over }) as PtcgCardRow;

const CARDS: Record<string, PtcgCardRow> = {
  sv10_221: card('sv10_221', 'Aventure de Luth'),
  sv10_33: card('sv10_33', 'Feurisson de Luth', { category: 'Pokémon' }),
  sv3_230: card('sv3_230', 'Énergie Feu de base', { category: 'Énergie' }),
};

const LUTH =
  "Une fois pendant votre tour, vous pouvez chercher dans votre deck une carte Aventure de Luth, la montrer, puis l'ajouter à votre main. Mélangez ensuite votre deck.";

const state = (hand: string[], discard: string[]): PtcgGameState =>
  ({
    players: {
      moi: {
        active: null,
        bench: [],
        hand: hand.map((id) => ({ id, name: id })),
        discard: discard.map((id) => ({ id, name: id })),
        unknownHand: 0,
        prizesRemaining: 6,
      },
    },
  }) as unknown as PtcgGameState;

describe('searchTarget', () => {
  it('names the card an ability searches for', () => {
    expect(searchTarget(LUTH, CARDS)).toEqual({ id: 'sv10_221', name: 'Aventure de Luth' });
  });

  it('ignores an effect that does not touch the deck', () => {
    expect(searchTarget('Piochez 3 cartes.', CARDS)).toBeNull();
  });

  it('returns null when the search is broader than one named card', () => {
    // "un Pokémon" is not a card name; nothing can be concluded, so nothing is.
    expect(searchTarget('Cherchez dans votre deck un Pokémon.', CARDS)).toBeNull();
  });

  it('never names a basic Energy, which has no copy limit', () => {
    expect(searchTarget('Cherchez dans votre deck une Énergie Feu de base.', CARDS)).toBeNull();
  });
});

describe('copiesOutsideDeck', () => {
  it('counts hand and discard together', () => {
    expect(
      copiesOutsideDeck(state(['sv10_221'], ['sv10_221', 'sv10_221']), 'moi', 'sv10_221'),
    ).toBe(3);
  });

  it('is zero for a player who has never seen the card', () => {
    expect(copiesOutsideDeck(state([], []), 'moi', 'sv10_221')).toBe(0);
  });
});

describe('searchExhausted', () => {
  it('stays false while a copy could still be in the deck', () => {
    // Three seen: the fourth could be in the deck or in the prizes. Not evidence.
    expect(
      searchExhausted(LUTH, state([], ['sv10_221', 'sv10_221', 'sv10_221']), 'moi', CARDS),
    ).toBe(false);
  });

  it('is true once all four copies are visible', () => {
    const four = ['sv10_221', 'sv10_221', 'sv10_221', 'sv10_221'];
    expect(searchExhausted(LUTH, state([], four), 'moi', CARDS)).toBe(true);
  });

  it('counts a copy held in hand, not only discarded ones', () => {
    const s = state(['sv10_221'], ['sv10_221', 'sv10_221', 'sv10_221']);
    expect(searchExhausted(LUTH, s, 'moi', CARDS)).toBe(true);
  });

  it('marks Unis par le Voyage dead from turn 4 of the real game', () => {
    // The game that prompted this: all four Aventure de Luth were out of the
    // deck by turn 4, and a coach still flagged three later evolutions as
    // "you did not use the ability first".
    const p = parseGame(
      readFileSync(join(process.cwd(), 'lib/ptcg/fixtures/zacian-2026-07-26.txt'), 'utf8'),
    );
    const evolutions = p.state.snapshots.filter((s) => {
      const e = s.event as Record<string, unknown>;
      return e.type === 'evolve' && (e.to as { id?: string })?.id === 'sv10_34';
    });
    expect(evolutions.length).toBe(3);
    for (const s of evolutions) {
      expect(searchExhausted(LUTH, s.state, p.me, CARDS)).toBe(true);
    }
  });
});
