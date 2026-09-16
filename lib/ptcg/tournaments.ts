import type { PtcgTournamentRoundRow } from '@/lib/types';

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
