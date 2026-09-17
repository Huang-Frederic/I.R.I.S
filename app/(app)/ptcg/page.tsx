// app/(app)/ptcg/page.tsx
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/api/fetch-all';
import PageTitle from '@/components/layout/PageTitle';
import BattleLogsPage, { type BattleLogGame } from '@/components/ptcg/BattleLogsPage';

export async function generateMetadata() {
  const t = await getTranslations('ptcg');
  return { title: t('battleLogsMetaTitle') };
}

/**
 * The Battle Logs page: paste a raw log, confirm/correct the two decks'
 * sprites, browse history grouped by day. Deliberately lightweight —
 * `state` (the parsed per-turn reconstruction, ~1MB per game) is never
 * selected here; it's fetched lazily per game when a row is expanded or
 * edited (see GET /api/ptcg/games/[id]).
 */
export default async function PtcgPage() {
  const t = await getTranslations('ptcg');
  const supabase = await createClient();

  const { data, error } = await fetchAllRows<BattleLogGame>((from, to) =>
    supabase
      .from('ptcg_games')
      .select(
        'id, played_at, me, opponent, result, my_archetype_dex, opponent_archetype_dex, went_first',
      )
      .order('played_at', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to),
  );

  if (error) {
    return (
      <section>
        <PageTitle title={t('pageTitle')} />
        <p className="text-red mt-4 text-sm">{t('loadError', { message: error.message })}</p>
      </section>
    );
  }

  return (
    <section>
      <PageTitle title={t('pageTitle')} />
      <div className="mt-6">
        <BattleLogsPage initialGames={data ?? []} />
      </div>
    </section>
  );
}
