import { describe, expect, it } from 'vitest';
import type { PtcgCardRow } from '@/lib/types';
import { canPayCost, energyPool } from './energy-cost';

const card = (over: Partial<PtcgCardRow>): PtcgCardRow =>
  ({
    ptcgl_id: 'x',
    language: 'FR',
    category: 'Énergie',
    types: null,
    attacks: [],
    abilities: [],
    ...over,
  }) as PtcgCardRow;

const CARDS: Record<string, PtcgCardRow> = {
  fire: card({ ptcgl_id: 'fire', types: ['Feu'] }),
  water: card({ ptcgl_id: 'water', types: ['Eau'] }),
  rainbow: card({ ptcgl_id: 'rainbow', types: ['Feu', 'Eau', 'Psy'] }),
  tool: card({ ptcgl_id: 'tool', category: 'Dresseur', types: null }),
  broken: card({ ptcgl_id: 'broken', types: [] }),
};
const ref = (id: string) => ({ id, name: id });

describe('energyPool', () => {
  it('collects the types of each attached energy', () => {
    expect(energyPool([ref('fire'), ref('water')], CARDS)).toEqual([['Feu'], ['Eau']]);
  });

  it('skips tools, which share the attached list but pay for nothing', () => {
    expect(energyPool([ref('fire'), ref('tool')], CARDS)).toEqual([['Feu']]);
  });

  it('is empty, not null, when nothing is attached', () => {
    expect(energyPool([], CARDS)).toEqual([]);
  });

  it('returns null when a card is unresolved', () => {
    // Guessing here would let the digest claim an attack was available.
    expect(energyPool([ref('never-seen')], CARDS)).toBeNull();
  });

  it('returns null when an energy has no types', () => {
    expect(energyPool([ref('broken')], CARDS)).toBeNull();
  });
});

describe('canPayCost', () => {
  it('pays a single typed cost', () => {
    expect(canPayCost(['Feu'], [['Feu']])).toBe(true);
  });

  it('refuses a typed cost with nothing attached', () => {
    // The defect this whole module exists for: a Héricendre with no energy
    // was advertising Flammèche for 30.
    expect(canPayCost(['Feu'], [])).toBe(false);
  });

  it('refuses when the attached energy is the wrong type', () => {
    expect(canPayCost(['Feu'], [['Eau']])).toBe(false);
  });

  it('pays Colorless with any energy', () => {
    expect(canPayCost(['Incolore', 'Incolore'], [['Eau'], ['Psy']])).toBe(true);
  });

  it('counts each energy once', () => {
    expect(canPayCost(['Feu', 'Feu'], [['Feu']])).toBe(false);
    expect(canPayCost(['Feu', 'Feu'], [['Feu'], ['Feu']])).toBe(true);
  });

  it('pays a mixed cost', () => {
    // Artillerie Vapeur: Feu Feu Incolore.
    expect(canPayCost(['Feu', 'Feu', 'Incolore'], [['Feu'], ['Feu'], ['Eau']])).toBe(true);
    expect(canPayCost(['Feu', 'Feu', 'Incolore'], [['Feu'], ['Eau'], ['Eau']])).toBe(false);
  });

  it('spends the least flexible energy first', () => {
    // A first-match strategy would spend the rainbow on Feu, then fail on Eau
    // even though the cost is payable.
    expect(canPayCost(['Feu', 'Eau'], [['Feu'], ['Feu', 'Eau', 'Psy']])).toBe(true);
  });

  it('does not let a typed energy be double-counted as Colorless', () => {
    expect(canPayCost(['Feu', 'Incolore'], [['Feu']])).toBe(false);
  });

  it('accepts a free attack', () => {
    expect(canPayCost([], [])).toBe(true);
  });
});
