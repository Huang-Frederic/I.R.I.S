import type { GameForStats } from './game-stats';
import type { PtcgTournamentRoundRow, PtcgTournamentRow } from '@/lib/types';

/**
 * A round's own win/loss/tie is never stored — it's derived from its games
 * (or its outcome, for the three special cases) every time it's needed, so
 * correcting one game's result never requires updating a separate column.
 */
export function deriveRoundResult(
  round: Pick<PtcgTournamentRoundRow, 'games' | 'outcome'>,
): 'win' | 'loss' | 'tie' {
  if (round.outcome === 'bye') return 'win';
  if (round.outcome === 'no_show') return 'loss';
  if (round.outcome === 'id') return 'tie';

  const wins = round.games.filter((g) => g.result === 'win').length;
  const losses = round.games.filter((g) => g.result === 'loss').length;
  if (wins > losses) return 'win';
  if (losses > wins) return 'loss';
  return 'tie';
}

/**
 * Converts one tournament round into the same shape `groupByMyArchetype`,
 * `matchupsForArchetype`, and `aggregateStats` already consume from logged
 * games — a round with no battle log slots into the exact same drill-down
 * as a logged game with the same archetype pairing, it just carries no
 * per-turn stats.
 *
 * `wentFirst` is taken from the round's FIRST game only, even for a
 * best-of-3 with multiple games: in competitive TCG, game 1 of a match is
 * the one decided by a coin flip / play-draw choice — later games in the
 * same match are usually at the previous loser's discretion, so game 1 is
 * the most representative answer to "who went first this round".
 */
export function tournamentRoundToGameForStats(
  tournament: Pick<PtcgTournamentRow, 'my_archetype_dex' | 'played_at'>,
  round: Pick<PtcgTournamentRoundRow, 'games' | 'outcome' | 'opponent_archetype_dex'>,
): GameForStats {
  return {
    stats: null,
    result: deriveRoundResult(round),
    play_score: null,
    playedAt: tournament.played_at,
    myArchetypeDex: tournament.my_archetype_dex,
    opponentArchetypeDex: round.opponent_archetype_dex,
    wentFirst: round.games[0]?.wentFirst ?? null,
  };
}
