import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
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
      'id, played_at, opponent, result, prizes_me, prizes_opponent, turns, my_archetype, opponent_archetype, my_key_card, opponent_key_card, play_score, ptcg_analyses(moments)',
    )
    // Import order breaks the tie. Games imported before the form captured a
    // time all sit at midnight, and equal keys leave the order undefined —
    // which is exactly how the list looked shuffled.
    .order('played_at', { ascending: false })
    .order('created_at', { ascending: false })
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
    const analysis = (g.ptcg_analyses ?? [])[0] as { moments?: { severity: string }[] } | undefined;
    const moments = analysis?.moments ?? [];
    const count = (s: string) => moments.filter((m) => m.severity === s).length;

    return {
      id: g.id,
      played_at: g.played_at,
      result: g.result,
      prizes_me: g.prizes_me,
      prizes_opponent: g.prizes_opponent,
      turns: g.turns,
      mine: fighter(g.my_key_card, g.my_archetype),
      // Falls back to the handle only when nothing better is known — a game
      // imported before protagonists were derived.
      theirs: fighter(g.opponent_key_card, g.opponent_archetype ?? g.opponent),
      score: g.play_score,
      errors: count('error'),
      warnings: count('warning'),
      good: count('good'),
    };
  });

  return (
    <section>
      <div className="flex items-start justify-between gap-3">
        <PageTitle title={t('pageTitle')} subtitle={t('pageSubtitle', { count: games.length })} />
        {games.length > 0 && (
          <Link
            href="/ptcg/stats"
            className="border-border bg-surface hover:border-red/50 mt-1 inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition"
          >
            <BarChart3 className="text-red h-4 w-4" aria-hidden />
            {t('statsLink')}
          </Link>
        )}
      </div>
      <div className="mt-6">
        <PtcgView games={games} />
      </div>
    </section>
  );
}
