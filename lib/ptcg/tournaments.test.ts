import { describe, expect, it } from 'vitest';
import { deriveRoundResult, tournamentRoundToGameForStats } from './tournaments';
import type { TournamentGame } from '@/lib/types';

const g = (result: TournamentGame['result']): TournamentGame => ({ result, wentFirst: null });

describe('deriveRoundResult', () => {
  it('wins a round with more game-wins than game-losses (WLW)', () => {
    expect(deriveRoundResult({ games: [g('win'), g('loss'), g('win')], outcome: null })).toBe('win');
  });

  it('loses a round with more game-losses than game-wins (LWL)', () => {
    expect(deriveRoundResult({ games: [g('loss'), g('win'), g('loss')], outcome: null })).toBe('loss');
  });

  it('ties a round split 1-1 with a tie game — the tie counts toward neither side (WLT)', () => {
    expect(deriveRoundResult({ games: [g('win'), g('loss'), g('tie')], outcome: null })).toBe('tie');
  });

  it('wins a clean sweep (WWW)', () => {
    expect(deriveRoundResult({ games: [g('win'), g('win'), g('win')], outcome: null })).toBe('win');
  });

  it('loses a best-of-3 decided early at 0-2, with no 3rd game recorded (LL)', () => {
    expect(deriveRoundResult({ games: [g('loss'), g('loss')], outcome: null })).toBe('loss');
  });

  it('treats a bye as a win, no games needed', () => {
    expect(deriveRoundResult({ games: [], outcome: 'bye' })).toBe('win');
  });

  it('treats a no-show as a loss', () => {
    expect(deriveRoundResult({ games: [], outcome: 'no_show' })).toBe('loss');
  });

  it('treats an intentional draw as a tie', () => {
    expect(deriveRoundResult({ games: [], outcome: 'id' })).toBe('tie');
  });

  it('treats an empty round with no outcome as a tie (not yet recorded)', () => {
    expect(deriveRoundResult({ games: [], outcome: null })).toBe('tie');
  });
});

describe('tournamentRoundToGameForStats', () => {
  const tournament = { my_archetype_dex: [157, 156], played_at: '2026-09-12' };

  it('produces a GameForStats row with no per-turn stats, using the round-derived result', () => {
    const round = {
      opponent_archetype_dex: [658],
      games: [g('win'), g('loss'), g('win')],
      outcome: null,
    };
    expect(tournamentRoundToGameForStats(tournament, round)).toEqual({
      stats: null,
      result: 'win',
      play_score: null,
      playedAt: '2026-09-12',
      myArchetypeDex: [157, 156],
      opponentArchetypeDex: [658],
      wentFirst: null,
    });
  });

  it("uses the FIRST game's wentFirst as the round's own — later games in a Bo3 don't override it", () => {
    const round = {
      opponent_archetype_dex: [658],
      games: [
        { result: 'win' as const, wentFirst: true },
        { result: 'loss' as const, wentFirst: false },
      ],
      outcome: null,
    };
    expect(tournamentRoundToGameForStats(tournament, round).wentFirst).toBe(true);
  });

  it('has no wentFirst when the round has no games (bye/no_show/id)', () => {
    const round = { opponent_archetype_dex: [658], games: [], outcome: 'bye' as const };
    expect(tournamentRoundToGameForStats(tournament, round).wentFirst).toBeNull();
  });
});
