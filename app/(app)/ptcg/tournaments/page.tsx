// app/(app)/ptcg/tournaments/page.tsx
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/api/fetch-all';
import PageTitle from '@/components/layout/PageTitle';
import TournamentsPage, { type TournamentListRow } from '@/components/ptcg/TournamentsPage';

export async function generateMetadata() {
  const t = await getTranslations('ptcg');
  return { title: t('tournamentsMetaTitle') };
}

export default async function PtcgTournamentsPage() {
  const t = await getTranslations('ptcg');
  const supabase = await createClient();

  const { data, error } = await fetchAllRows<TournamentListRow>((from, to) =>
    supabase
      .from('ptcg_tournaments')
      .select(
        'id, user_id, name, played_at, category, best_of, placement, my_archetype_dex, created_at, updated_at, rounds:ptcg_tournament_rounds(games, outcome)',
      )
      .order('played_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to),
  );

  if (error) {
    return (
      <section>
        <PageTitle title={t('tournamentsPageTitle')} />
        <p className="text-red mt-4 text-sm">{t('loadError', { message: error.message })}</p>
      </section>
    );
  }

  return (
    <section>
      <PageTitle title={t('tournamentsPageTitle')} />
      <div className="mt-6">
        <TournamentsPage initialTournaments={data ?? []} />
      </div>
    </section>
  );
}
