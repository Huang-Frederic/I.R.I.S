import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import PageTitle from '@/components/layout/PageTitle';
import PtcgView, { type PtcgGameSummary } from '@/components/ptcg/PtcgView';
import { aggregatePatterns, type PtcgGameWithPatterns } from '@/lib/utils/ptcg-patterns';

export async function generateMetadata() {
  const t = await getTranslations('ptcg');
  return { title: t('metaTitle') };
}

export default async function PtcgPage() {
  const t = await getTranslations('ptcg');
  const supabase = await createClient();

  // `state` is deliberately excluded: it is around a megabyte per game and only
  // the replay page needs it. RLS already scopes this to the current user.
  const { data, error } = await supabase
    .from('ptcg_games')
    .select(
      'id, played_at, me, opponent, result, prizes_me, prizes_opponent, turns, opponent_archetype, ptcg_analyses(patterns, verdict, moments)',
    )
    .order('played_at', { ascending: false })
    .limit(200);

  if (error) {
    return (
      <section>
        <PageTitle title={t('pageTitle')} />
        <p className="text-red mt-4 text-sm">{t('loadError', { message: error.message })}</p>
      </section>
    );
  }

  const rows = data ?? [];

  const games: PtcgGameSummary[] = rows.map((g) => {
    // Most recent analysis wins when a game has been re-analysed.
    const analysis = (g.ptcg_analyses ?? [])[0] as
      | { verdict?: { summary?: string }; moments?: unknown[] }
      | undefined;
    return {
      id: g.id,
      played_at: g.played_at,
      me: g.me,
      opponent: g.opponent,
      result: g.result,
      prizes_me: g.prizes_me,
      prizes_opponent: g.prizes_opponent,
      turns: g.turns,
      opponent_archetype: g.opponent_archetype,
      summary: analysis?.verdict?.summary ?? null,
      findings: analysis?.moments?.length ?? 0,
    };
  });

  const patterns = aggregatePatterns(rows as unknown as PtcgGameWithPatterns[]);

  return (
    <section>
      <PageTitle title={t('pageTitle')} subtitle={t('pageSubtitle', { count: games.length })} />
      <div className="mt-6">
        <PtcgView games={games} patterns={patterns} />
      </div>
    </section>
  );
}
