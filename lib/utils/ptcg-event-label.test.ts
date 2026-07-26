import { describe, expect, it } from 'vitest';
import { eventLabel } from './ptcg-event-label';

describe('eventLabel', () => {
  it('describes the common actions', () => {
    expect(eventLabel({ type: 'draw-known', card: { name: 'Hyper Ball' } })).toBe(
      'pioche Hyper Ball',
    );
    expect(
      eventLabel({ type: 'evolve', from: { name: 'Feurisson' }, to: { name: 'Typhlosion' } }),
    ).toBe('fait évoluer Feurisson → Typhlosion');
    expect(
      eventLabel({
        type: 'attack',
        source: { name: 'Typhlosion' },
        move: 'Explosion',
        damage: 320,
      }),
    ).toBe('Typhlosion — Explosion → 320 dégâts');
  });

  it('writes the exporting player in the second person', () => {
    const ev = { type: 'take-prize', player: 'Hisshiden', count: 3 };
    // "toi prend" is not French; only the player's own side conjugates.
    expect(eventLabel(ev, 'Hisshiden', 'Fumpky')).toBe('tu prends 3 récompense(s)');
    expect(eventLabel(ev, 'Fumpky', 'Hisshiden')).toBe('Hisshiden prend 3 récompense(s)');
  });

  it('separates activating a Stadium from playing one', () => {
    expect(eventLabel({ type: 'play-stadium', card: { name: 'Montagne Gravité' } })).toBe(
      'pose le stade Montagne Gravité',
    );
    expect(eventLabel({ type: 'use-stadium', stadium: 'Carrière Fossile' })).toBe(
      'active le stade Carrière Fossile',
    );
  });

  it('falls back to the event type rather than rendering nothing', () => {
    // A new phrasing should show up as an odd label, not as a blank row.
    expect(eventLabel({ type: 'something-new' })).toBe('something-new');
  });

  it('describes the setup phase, which is where the replay opens', () => {
    expect(eventLabel({ type: 'setup-section' })).toBe('préparation');
    expect(eventLabel({ type: 'coin-win', player: 'Bklee219' }, 'Hisshiden', 'Bklee219')).toBe(
      'Bklee219 gagne le lancer',
    );
    expect(
      eventLabel({ type: 'play-order', player: 'Hisshiden', order: 'en second' }, 'Hisshiden'),
    ).toBe('tu joues en second');
  });

  it('names the cards when the log gave them', () => {
    // Both spellings exist in real logs: a named single card and a bulk count.
    expect(
      eventLabel({
        type: 'shuffle-into-deck',
        player: 'Hisshiden',
        count: 1,
        cards: [{ name: 'Aventure de Luth' }],
      }),
    ).toBe('Hisshiden mélange Aventure de Luth au deck');
    expect(eventLabel({ type: 'shuffle-into-deck', player: 'Hisshiden', count: 3 })).toBe(
      'Hisshiden mélange 3 cartes au deck',
    );
  });

  it('keeps the singular when a bulk rule reports one card', () => {
    expect(eventLabel({ type: 'discard-from-hand', player: 'Hisshiden', count: 1 })).toBe(
      'Hisshiden défausse 1 carte de sa main',
    );
  });

  it('attributes hand disruption to the player who caused it', () => {
    // The actor and the victim are different people here; swapping them would
    // read as the victim discarding their own hand.
    expect(
      eventLabel(
        { type: 'discard-opponent-hand', actor: 'Bklee219', player: 'Hisshiden', count: 4 },
        'Hisshiden',
        'Bklee219',
      ),
    ).toBe('Bklee219 défausse 4 cartes de ta main');
  });

  it('names both sides of an active swap', () => {
    expect(
      eventLabel({
        type: 'swap-active',
        player: 'Hisshiden',
        incoming: { name: 'Favianos-ex' },
        outgoing: { name: 'Typhlosion de Luth' },
      }),
    ).toBe("Favianos-ex remplace Typhlosion de Luth à l'Actif");
  });
});
