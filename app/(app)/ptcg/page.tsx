import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/api/fetch-all';
import { extractGameStats } from '@/lib/ptcg/game-stats';
import { extractOpponentSignals, classifyMyDeck, classifyOpponent } from '@/lib/ptcg/archetype';
import type { PtcgCardRow } from '@/lib/types';
import PageTitle from '@/components/layout/PageTitle';
import PtcgDashboard, { type DashboardGame } from '@/components/ptcg/PtcgDashboard';

export async function generateMetadata() {
  const t = await getTranslations('ptcg');
  return { title: t('metaTitle') };
}

/**
 * The Duels page is a pure statistics dashboard: every imported game is re-read
 * from its raw log (result, openings, setup speed, tempo, both archetypes) and
 * aggregated, with the game list at the bottom. No AI review — just the numbers.
 * Every metric here is deck-agnostic, so a new list shows up with real numbers
 * the moment its first game is imported — nothing to add per deck.
 * Reading the raw logs live means the concede/tie fix and the archetype rules
 * apply retroactively to every game already imported.
 */
export default async function PtcgPage() {
  const t = await getTranslations('ptcg');
  const supabase = await createClient();

  const { data, error } = await fetchAllRows<{
    id: string;
    played_at: string;
    me: string;
    opponent: string;
    play_score: number | null;
    opponent_key_card: string | null;
    raw_log: string;
  }>((from, to) =>
    supabase
      .from('ptcg_games')
      .select('id, played_at, me, opponent, play_score, opponent_key_card, raw_log')
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

  // Resolve the opponent ace-card ids to names once — the classifier's fallback.
  const aceIds = [
    ...new Set((data ?? []).map((g) => g.opponent_key_card).filter(Boolean)),
  ] as string[];
  const { data: aceRows } = aceIds.length
    ? await supabase.from('ptcg_cards').select('ptcgl_id, name').in('ptcgl_id', aceIds)
    : { data: [] };
  const aceName = new Map(
    ((aceRows ?? []) as Pick<PtcgCardRow, 'ptcgl_id' | 'name'>[]).map((c) => [c.ptcgl_id, c.name]),
  );

  // Every Supporter name we know of, so a turn can be checked for "did I play
  // my Supporter?" without the dashboard knowing a single card by name. No
  // language filter: "Supporter" is the trainer_type in both FR and EN rows,
  // and localized names don't collide across languages.
  const { data: supporterRows } = await fetchAllRows<{ name: string }>((from, to) =>
    supabase.from('ptcg_cards').select('name').eq('trainer_type', 'Supporter').range(from, to),
  );
  const supporterNames = [...new Set((supporterRows ?? []).map((c) => c.name))];

  const games: DashboardGame[] = (data ?? []).map((g) => {
    const stats = extractGameStats(g.raw_log, g.me, supporterNames);
    const ace = g.opponent_key_card ? (aceName.get(g.opponent_key_card) ?? null) : null;
    const oppPokemon = extractOpponentSignals(g.raw_log, g.opponent);
    return {
      id: g.id,
      playedAt: g.played_at,
      opponent: g.opponent,
      stats,
      // Re-derived from the log — corrects a concede stored as a tie.
      result: stats.result,
      play_score: g.play_score,
      myArchetype: classifyMyDeck(g.raw_log, g.me),
      opponent_archetype: classifyOpponent(oppPokemon, ace),
    };
  });

  return (
    <section>
      <PageTitle title={t('pageTitle')} subtitle={t('pageSubtitle', { count: games.length })} />
      <div className="mt-6">
        <PtcgDashboard games={games} />
      </div>
    </section>
  );
}
