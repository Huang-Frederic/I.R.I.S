import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/api/fetch-all';
import PageTitle from '@/components/layout/PageTitle';
import TournamentDetailPage from '@/components/ptcg/TournamentDetailPage';
import type { PtcgTournamentRoundRow, PtcgTournamentRow } from '@/lib/types';

export default async function PtcgTournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations('ptcg');
  const supabase = await createClient();

  const { data: tournament, error } = await supabase
    .from('ptcg_tournaments')
    .select(
      'id, user_id, name, played_at, category, best_of, placement, my_archetype_dex, created_at, updated_at',
    )
    .eq('id', id)
    .maybeSingle<PtcgTournamentRow>();
  if (error || !tournament) notFound();

  const { data: rounds } = await fetchAllRows<PtcgTournamentRoundRow>((from, to) =>
    supabase
      .from('ptcg_tournament_rounds')
      .select('id, tournament_id, round_number, opponent_archetype_dex, games, outcome, created_at')
      .eq('tournament_id', id)
      .order('round_number', { ascending: true })
      .range(from, to),
  );

  return (
    <section>
      <PageTitle title={tournament.name} subtitle={t('tournamentsPageTitle')} />
      <div className="mt-6">
        <TournamentDetailPage tournament={tournament} initialRounds={rounds ?? []} />
      </div>
    </section>
  );
}
