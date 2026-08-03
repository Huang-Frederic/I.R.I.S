import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/api/fetch-all';
import { extractGameStats, aggregateStats, type GameForStats } from '@/lib/ptcg/game-stats';
import PageTitle from '@/components/layout/PageTitle';
import PtcgStats from '@/components/ptcg/PtcgStats';

export async function generateMetadata() {
  const t = await getTranslations('ptcgStats');
  return { title: t('metaTitle') };
}

/**
 * Aggregate consistency stats over every imported game. The raw logs are the
 * source of truth already stored on each row, so this works retroactively — no
 * new data to capture, nothing to re-paste. Extraction happens server-side and
 * only the aggregate reaches the client (the logs never leave the server).
 */
export default async function PtcgStatsPage() {
  const t = await getTranslations('ptcgStats');
  const supabase = await createClient();

  const { data, error } = await fetchAllRows<{
    raw_log: string;
    me: string;
    result: 'win' | 'loss' | 'tie';
    play_score: number | null;
    opponent_archetype: string | null;
    opponent: string;
  }>((from, to) =>
    supabase
      .from('ptcg_games')
      .select('raw_log, me, result, play_score, opponent_archetype, opponent')
      .order('played_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  );

  if (error) {
    return (
      <section>
        <PageTitle title={t('pageTitle')} />
        <p className="text-red mt-4 text-sm">{error.message}</p>
      </section>
    );
  }

  const rows: GameForStats[] = (data ?? []).map((g) => ({
    stats: extractGameStats(g.raw_log, g.me),
    result: g.result,
    play_score: g.play_score,
    opponent_archetype: g.opponent_archetype ?? g.opponent,
  }));

  const agg = aggregateStats(rows);

  return (
    <section>
      <Link
        href="/ptcg"
        className="text-text-muted hover:text-text mb-3 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t('backToGames')}
      </Link>
      <PageTitle title={t('pageTitle')} subtitle={t('pageSubtitle', { count: agg.games })} />
      <div className="mt-6">
        <PtcgStats stats={agg} />
      </div>
    </section>
  );
}
