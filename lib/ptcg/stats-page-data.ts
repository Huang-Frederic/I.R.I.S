import { tournamentRoundToGameForStats } from './tournaments';
import type { StatsGame } from '@/components/ptcg/StatsPage';
import type { PtcgTournamentRoundRow, PtcgTournamentRow } from '@/lib/types';

export interface TournamentWithRounds
  extends Pick<PtcgTournamentRow, 'id' | 'my_archetype_dex' | 'played_at'> {
  rounds: Pick<PtcgTournamentRoundRow, 'games' | 'outcome' | 'opponent_archetype_dex'>[];
}

/**
 * Combines already-converted logged games with tournament rounds into the
 * single array the Stats drill-down (groupByMyArchetype/
 * matchupsForArchetype/aggregateStats) consumes. Each round becomes one
 * synthetic StatsGame row — `id`/`opponent` are placeholders since neither
 * field is read anywhere in the Stats drill-down (only the archetype-dex
 * arrays, `result`, and `stats` are).
 */
export function combineGamesForStats(
  loggedGames: StatsGame[],
  tournaments: TournamentWithRounds[],
): StatsGame[] {
  const tournamentGames: StatsGame[] = tournaments.flatMap((tn) =>
    tn.rounds.map((round, i) => ({
      id: `tournament-${tn.id}-${i}`,
      opponent: '',
      ...tournamentRoundToGameForStats(tn, round),
    })),
  );
  return [...loggedGames, ...tournamentGames];
}
