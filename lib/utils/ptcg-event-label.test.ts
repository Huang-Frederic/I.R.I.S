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

  it('says "toi" for the exporting player', () => {
    const ev = { type: 'take-prize', player: 'Hisshiden', count: 3 };
    expect(eventLabel(ev, 'Hisshiden', 'Fumpky')).toBe('toi prend 3 récompense(s)');
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
});
