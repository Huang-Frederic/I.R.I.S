import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/api/fetch-all';
import { extractGameStats } from '@/lib/ptcg/game-stats';
import { extractPokemon, classifyMyDeck, classifyOpponent } from '@/lib/ptcg/archetype';
import type { PtcgCardRow } from '@/lib/types';
import PageTitle from '@/components/layout/PageTitle';
import PtcgDashboard, { type DashboardGame } from '@/components/ptcg/PtcgDashboard';

export async function generateMetadata() {
  const t = await getTranslations('ptcg');
  return { title: t('metaTitle') };
}

const normName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** The Dusknoir line (Duskull/Dusclops/Dusknoir), Psyduck's counter target. */
const DUSKNOIR = ['noctunoir', 'teraclope', 'skelenox'];
const hasDusknoirLine = (pokemon: Set<string>) =>
  [...pokemon].some((p) => DUSKNOIR.some((k) => normName(p).includes(k)));

/**
 * The Duels page is a pure statistics dashboard: every imported game is re-read
 * from its raw log (result, openings, setup speed, engine, both archetypes) and
 * aggregated, with the game list at the bottom. No AI review — just the numbers.
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

  // HP by (accent-insensitive) FR name, so a KO can be tested for Victini's
  // margin: without its +10, would the target have survived?
  // No language filter: localized names don't collide across languages, so
  // every HP-bearing card can key by its own name. (A language filter here was
  // silently matching nothing, which left Victini's margin uncomputable.)
  const { data: hpRows } = await fetchAllRows<{ name: string; hp: number | null }>((from, to) =>
    supabase.from('ptcg_cards').select('name, hp').not('hp', 'is', null).range(from, to),
  );
  const hpByName: Record<string, number> = {};
  for (const c of hpRows ?? []) if (c.hp != null) hpByName[normName(c.name)] = c.hp;

  const games: DashboardGame[] = (data ?? []).map((g) => {
    const stats = extractGameStats(g.raw_log, g.me, hpByName);
    const ace = g.opponent_key_card ? (aceName.get(g.opponent_key_card) ?? null) : null;
    const oppPokemon = extractPokemon(g.raw_log, g.opponent);
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
      // Psyduck's Damp shuts off self-KO abilities — the Dusknoir line is its
      // canonical target, so a game vs it is a game Psyduck could have mattered.
      psyduckRelevant: hasDusknoirLine(oppPokemon),
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
