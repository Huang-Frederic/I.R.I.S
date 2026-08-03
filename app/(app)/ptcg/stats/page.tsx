import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/api/fetch-all';
import { extractGameStats, type GameForStats } from '@/lib/ptcg/game-stats';
import { extractPokemon, classifyMyDeck, classifyOpponent } from '@/lib/ptcg/archetype';
import type { PtcgCardRow } from '@/lib/types';
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
    opponent: string;
    result: 'win' | 'loss' | 'tie';
    play_score: number | null;
    opponent_key_card: string | null;
  }>((from, to) =>
    supabase
      .from('ptcg_games')
      .select('raw_log, me, opponent, result, play_score, opponent_key_card')
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

  // The opponent's ace name is the classifier's fallback — resolve the key card
  // id to its printed name once for every game on the page.
  const aceIds = [...new Set((data ?? []).map((g) => g.opponent_key_card).filter(Boolean))] as string[];
  const { data: aceRows } = aceIds.length
    ? await supabase.from('ptcg_cards').select('ptcgl_id, name').in('ptcgl_id', aceIds)
    : { data: [] };
  const aceName = new Map(
    ((aceRows ?? []) as Pick<PtcgCardRow, 'ptcgl_id' | 'name'>[]).map((c) => [c.ptcgl_id, c.name]),
  );

  const rows: GameForStats[] = (data ?? []).map((g) => {
    const oppPokemon = extractPokemon(g.raw_log, g.opponent);
    const ace = g.opponent_key_card ? (aceName.get(g.opponent_key_card) ?? null) : null;
    return {
      stats: extractGameStats(g.raw_log, g.me),
      result: g.result,
      play_score: g.play_score,
      myArchetype: classifyMyDeck(extractPokemon(g.raw_log, g.me)),
      opponent_archetype: classifyOpponent(oppPokemon, ace),
    };
  });

  return (
    <section>
      <Link
        href="/ptcg"
        className="text-text-muted hover:text-text mb-3 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t('backToGames')}
      </Link>
      <PageTitle title={t('pageTitle')} subtitle={t('pageSubtitle', { count: rows.length })} />
      <div className="mt-6">
        <PtcgStats games={rows} />
      </div>
    </section>
  );
}
