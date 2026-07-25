import { describe, expect, it } from 'vitest';
import type { PtcgMistakeCode } from '@/lib/types';
import { aggregatePatterns, type PtcgGameWithPatterns } from './ptcg-patterns';

type Patterns = { code: PtcgMistakeCode; occurrences: number }[];

/** `analyses` is a list of analyses, each holding its own patterns. */
const game = (id: string, analyses: Patterns[] | null): PtcgGameWithPatterns => ({
  id,
  played_at: '2026-07-01T00:00:00Z',
  ptcg_analyses: analyses ? analyses.map((patterns) => ({ patterns })) : null,
});

describe('aggregatePatterns', () => {
  it('returns nothing without analysed games', () => {
    expect(aggregatePatterns([])).toEqual([]);
    expect(aggregatePatterns([game('1', null)])).toEqual([]);
  });

  it('counts a mistake once per game, not once per occurrence', () => {
    // One messy game with five slips must not outrank a habit seen every game.
    const stats = aggregatePatterns([
      game('1', [[{ code: 'ability_unused', occurrences: 5 }]]),
      game('2', [[{ code: 'missed_lethal', occurrences: 1 }]]),
      game('3', [[{ code: 'missed_lethal', occurrences: 1 }]]),
    ]);
    expect(stats[0].code).toBe('missed_lethal');
    expect(stats[0].games).toBe(2);
    expect(stats[1]).toMatchObject({ code: 'ability_unused', games: 1, occurrences: 5 });
  });

  it('reports the share of games affected', () => {
    const stats = aggregatePatterns([
      game('1', [[{ code: 'ability_unused', occurrences: 1 }]]),
      game('2', [[{ code: 'ability_unused', occurrences: 2 }]]),
      game('3', [[]]),
      game('4', [[]]),
    ]);
    expect(stats[0]).toMatchObject({ games: 2, occurrences: 3, rate: 0.5 });
  });

  it('escalates severity with frequency, not with one bad game', () => {
    const everyGame = aggregatePatterns([
      game('1', [[{ code: 'ability_unused', occurrences: 1 }]]),
      game('2', [[{ code: 'ability_unused', occurrences: 1 }]]),
    ]);
    expect(everyGame[0].severity).toBe('error');

    const rare = aggregatePatterns([
      game('1', [[{ code: 'ability_unused', occurrences: 9 }]]),
      ...Array.from({ length: 9 }, (_, i) => game(String(i + 2), [[]])),
    ]);
    expect(rare[0].severity).toBe('note');
  });

  it('does not double-count a game that was analysed twice', () => {
    // Re-analysing an old game with better rules must not inflate the history.
    const stats = aggregatePatterns([
      game('1', [
        [{ code: 'ability_unused', occurrences: 2 }],
        [{ code: 'ability_unused', occurrences: 3 }],
      ]),
    ]);
    expect(stats[0]).toMatchObject({ games: 1, occurrences: 3 });
  });

  it('counts only analysed games in the denominator', () => {
    // An unanalysed game is not evidence that the mistake was absent.
    const stats = aggregatePatterns([
      game('1', [[{ code: 'ability_unused', occurrences: 1 }]]),
      game('2', null),
    ]);
    expect(stats[0].rate).toBe(1);
  });
});
