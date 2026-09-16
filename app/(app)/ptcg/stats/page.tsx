// app/(app)/ptcg/stats/page.tsx
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/api/fetch-all';
import { extractGameStats } from '@/lib/ptcg/game-stats';
import PageTitle from '@/components/layout/PageTitle';
import StatsPage, { type StatsGame } from '@/components/ptcg/StatsPage';

export async function generateMetadata() {
  const t = await getTranslations('ptcg');
  return { title: t('metaTitle') };
}

/**
 * The Stats page is a pure statistics dashboard: every imported game is
 * re-read from its raw log for the numeric metrics (result, openings, setup
 * speed, tempo), grouped by the archetype-dex arrays stored (or, for a game
 * imported before that existed, left as `[]` — "Unclassified" until someone
 * corrects it via Battle Logs' edit affordance). No AI review — just the
 * numbers.
 */
export default async function PtcgStatsPage() {
  const t = await getTranslations('ptcg');
  const supabase = await createClient();

  const { data, error } = await fetchAllRows<{
    id: string;
    played_at: string;
    me: string;
    opponent: string;
    play_score: number | null;
    raw_log: string;
    my_archetype_dex: number[] | null;
    opponent_archetype_dex: number[] | null;
  }>((from, to) =>
    supabase
      .from('ptcg_games')
      .select(
        'id, played_at, me, opponent, play_score, raw_log, my_archetype_dex, opponent_archetype_dex',
      )
      .order('played_at', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to),
  );

  if (error) {
    return (
      <section>
        <PageTitle title={t('statsPageTitle')} />
        <p className="text-red mt-4 text-sm">{t('loadError', { message: error.message })}</p>
      </section>
    );
  }

  const { data: supporterRows } = await fetchAllRows<{ name: string }>((from, to) =>
    supabase.from('ptcg_cards').select('name').eq('trainer_type', 'Supporter').range(from, to),
  );
  const supporterNames = [...new Set((supporterRows ?? []).map((c) => c.name))];

  const games: StatsGame[] = (data ?? []).map((g) => {
    const stats = extractGameStats(g.raw_log, g.me, supporterNames);
    return {
      id: g.id,
      opponent: g.opponent,
      stats,
      wentFirst: stats.wentFirst,
      result: stats.result,
      play_score: g.play_score,
      playedAt: g.played_at,
      myArchetypeDex: g.my_archetype_dex ?? [],
      opponentArchetypeDex: g.opponent_archetype_dex ?? [],
    };
  });

  return (
    <section>
      <PageTitle title={t('statsPageTitle')} subtitle={t('pageSubtitle', { count: games.length })} />
      <div className="mt-6">
        <StatsPage games={games} />
      </div>
    </section>
  );
}
