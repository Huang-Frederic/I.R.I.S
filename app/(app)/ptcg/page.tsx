import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import PageTitle from '@/components/layout/PageTitle';
import PtcgView, { type PtcgGameCard } from '@/components/ptcg/PtcgView';

export async function generateMetadata() {
  const t = await getTranslations('ptcg');
  return { title: t('metaTitle') };
}

export default async function PtcgPage() {
  const t = await getTranslations('ptcg');
  const supabase = await createClient();

  // `state` is deliberately excluded: it is around a megabyte per game and only
  // the replay page needs it. The two key cards were derived at import for
  // exactly this reason. RLS already scopes the query to the current user.
  const { data, error } = await supabase
    .from('ptcg_games')
    .select(
      'id, played_at, opponent, result, prizes_me, prizes_opponent, turns, my_archetype, opponent_archetype, my_key_card, opponent_key_card, ptcg_analyses(verdict, moments)',
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

  // One lookup for every protagonist on the page — the card art lives in
  // ptcg_cards, not on the game row.
  const cardIds = [
    ...new Set(rows.flatMap((g) => [g.my_key_card, g.opponent_key_card]).filter(Boolean)),
  ] as string[];

  const { data: cardRows } = cardIds.length
    ? await supabase.from('ptcg_cards').select('ptcgl_id, name, image_url').in('ptcgl_id', cardIds)
    : { data: [] };

  const art = new Map(
    ((cardRows ?? []) as { ptcgl_id: string; name: string; image_url: string | null }[]).map(
      (c) => [c.ptcgl_id, c],
    ),
  );

  const fighter = (cardId: string | null, archetype: string | null) => {
    if (!cardId && !archetype) return null;
    const card = cardId ? art.get(cardId) : undefined;
    return { name: archetype ?? card?.name ?? '—', image: card?.image_url ?? null };
  };

  const games: PtcgGameCard[] = rows.map((g) => {
    // Most recent analysis wins when a game has been re-analysed.
    const analysis = (g.ptcg_analyses ?? [])[0] as
      | { verdict?: { summary?: string }; moments?: unknown[] }
      | undefined;
    return {
      id: g.id,
      played_at: g.played_at,
      opponent: g.opponent,
      result: g.result,
      prizes_me: g.prizes_me,
      prizes_opponent: g.prizes_opponent,
      turns: g.turns,
      mine: fighter(g.my_key_card, g.my_archetype),
      // Falls back to the handle only when nothing better is known — a game
      // imported before protagonists were derived.
      theirs: fighter(g.opponent_key_card, g.opponent_archetype ?? g.opponent),
      summary: analysis?.verdict?.summary ?? null,
      findings: analysis?.moments?.length ?? 0,
    };
  });

  return (
    <section>
      <PageTitle title={t('pageTitle')} subtitle={t('pageSubtitle', { count: games.length })} />
      <div className="mt-6">
        <PtcgView games={games} />
      </div>
    </section>
  );
}
