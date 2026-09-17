import { describe, expect, it } from 'vitest';
import { combineGamesForStats } from './stats-page-data';
import type { StatsGame } from '@/components/ptcg/StatsPage';

const loggedGame: StatsGame = {
  id: 'g1',
  opponent: 'Bklee219',
  stats: null,
  wentFirst: true,
  result: 'win',
  play_score: 100,
  playedAt: '2026-09-01T00:00:00.000Z',
  myArchetypeDex: [157],
  opponentArchetypeDex: [658],
};

describe('combineGamesForStats', () => {
  it('returns the logged games unchanged when there are no tournaments', () => {
    expect(combineGamesForStats([loggedGame], [])).toEqual([loggedGame]);
  });

  it('converts each round of each tournament into one StatsGame row, appended after the logged games', () => {
    const result = combineGamesForStats([loggedGame], [
      {
        id: 't1',
        my_archetype_dex: [157, 156],
        played_at: '2026-09-12',
        rounds: [
          { games: [{ result: 'win', wentFirst: true }], outcome: null, opponent_archetype_dex: [658] },
          { games: [], outcome: 'bye', opponent_archetype_dex: [] },
        ],
      },
    ]);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual(loggedGame);
    expect(result[1]).toMatchObject({ stats: null, result: 'win', myArchetypeDex: [157, 156] });
    expect(result[2]).toMatchObject({ stats: null, result: 'win', opponentArchetypeDex: [] });
  });

  it('gives every tournament-derived row a unique, stable id', () => {
    const result = combineGamesForStats([], [
      {
        id: 't1',
        my_archetype_dex: [],
        played_at: '2026-09-12',
        rounds: [
          { games: [{ result: 'win', wentFirst: null }], outcome: null, opponent_archetype_dex: [] },
          { games: [{ result: 'loss', wentFirst: null }], outcome: null, opponent_archetype_dex: [] },
        ],
      },
    ]);

    const ids = result.map((r) => r.id);
    expect(new Set(ids).size).toBe(2);
  });
});
