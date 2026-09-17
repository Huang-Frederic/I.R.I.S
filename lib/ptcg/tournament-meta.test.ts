import { describe, expect, it } from 'vitest';
import { CATEGORY_OPTIONS, PLACEMENT_OPTIONS } from './tournament-meta';
import type { PtcgTournamentCategory, PtcgTournamentPlacement } from '@/lib/types';

const ALL_CATEGORIES: PtcgTournamentCategory[] = [
  'online', 'locals', 'challenge', 'cup', 'regionals', 'internationals', 'worlds',
];
const ALL_PLACEMENTS: PtcgTournamentPlacement[] = [
  'no_placement', 'dropped', 'winner', 'top_2', 'top_4', 'top_8', 'top_16',
  'top_32', 'top_64', 'top_128', 'top_256', 'top_512', 'top_1024',
];

describe('CATEGORY_OPTIONS', () => {
  it('has exactly one entry per PtcgTournamentCategory value, matching the DB check-constraint order', () => {
    expect(CATEGORY_OPTIONS.map((o) => o.value)).toEqual(ALL_CATEGORIES);
  });

  it('gives every option a distinct icon component', () => {
    const icons = new Set(CATEGORY_OPTIONS.map((o) => o.icon));
    expect(icons.size).toBe(CATEGORY_OPTIONS.length);
  });

  it('names each labelKey category_<value>', () => {
    for (const o of CATEGORY_OPTIONS) {
      expect(o.labelKey).toBe(`category_${o.value}`);
    }
  });
});

describe('PLACEMENT_OPTIONS', () => {
  it('has exactly one entry per PtcgTournamentPlacement value', () => {
    expect([...PLACEMENT_OPTIONS.map((o) => o.value)].sort()).toEqual([...ALL_PLACEMENTS].sort());
  });

  it('orders broadest field cut first and the most exclusive placements last', () => {
    expect(PLACEMENT_OPTIONS.map((o) => o.value)).toEqual([
      'no_placement', 'dropped', 'top_1024', 'top_512', 'top_256', 'top_128',
      'top_64', 'top_32', 'top_16', 'top_8', 'top_4', 'top_2', 'winner',
    ]);
  });

  it('names each labelKey placement_<value>', () => {
    for (const o of PLACEMENT_OPTIONS) {
      expect(o.labelKey).toBe(`placement_${o.value}`);
    }
  });
});
