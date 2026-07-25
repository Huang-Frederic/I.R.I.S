import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import PtcgReplay from '@/components/ptcg/PtcgReplay';
import type { PtcgCardRow, PtcgGameRow, PtcgAnalysisRow } from '@/lib/types';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations('ptcg');
  const supabase = await createClient();
  const { data } = await supabase
    .from('ptcg_games')
    .select('opponent, opponent_archetype')
    .eq('id', id)
    .single();
  return {
    title: data ? t('versus', { opponent: data.opponent_archetype ?? data.opponent }) : t('metaTitle'),
  };
}

export default async function PtcgGamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations('ptcg');
  const supabase = await createClient();

  const { data: game } = await supabase
    .from('ptcg_games')
    .select('id, played_at, me, opponent, result, prizes_me, prizes_opponent, turns, state')
    .eq('id', id)
    .single<Pick<PtcgGameRow, 'id' | 'played_at' | 'me' | 'opponent' | 'result' | 'prizes_me' | 'prizes_opponent' | 'turns' | 'state'>>();

  if (!game) notFound();

  const { data: analyses } = await supabase
    .from('ptcg_analyses')
    .select('verdict, moments, checklist')
    .eq('game_id', id)
    .order('created_at', { ascending: false })
    .limit(1);
  const analysis = (analyses ?? [])[0] as Pick<
    PtcgAnalysisRow,
    'verdict' | 'moments' | 'checklist'
  > | null;

  // Only the cards this game actually used — the table holds every card ever
  // seen, and shipping all of them to the client would dwarf the replay itself.
  const seen = new Set<string>();
  for (const s of game.state.snapshots) {
    for (const p of Object.values(s.state.players)) {
      for (const k of [p.active, ...p.bench]) if (k) seen.add(k.cardId);
      for (const c of [...p.hand, ...p.discard]) seen.add(c.id);
    }
  }
  const { data: cardRows } = await supabase
    .from('ptcg_cards')
    .select('*')
    .in('ptcgl_id', [...seen]);

  const cards = Object.fromEntries(
    ((cardRows ?? []) as PtcgCardRow[]).map((c) => [c.ptcgl_id, c]),
  );

  return (
    <section>
      <Link
        href="/ptcg"
        className="text-text-muted hover:text-text mb-3 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t('pageTitle')}
      </Link>

      <header className="mb-4">
        <h1 className="text-xl font-semibold">
          {t('versus', { opponent: game.opponent })}
          <span className="text-text-muted ml-3 text-base tabular-nums">
            {game.prizes_me}–{game.prizes_opponent}
          </span>
        </h1>
        {analysis?.verdict?.summary && (
          <p className="text-text-muted mt-2 max-w-3xl text-sm leading-relaxed">
            {analysis.verdict.summary}
          </p>
        )}
      </header>

      <PtcgReplay
        me={game.me}
        opponent={game.opponent}
        snapshots={game.state.snapshots}
        turns={game.state.turns}
        cards={cards}
        analysis={analysis}
      />

      {analysis?.checklist && analysis.checklist.length > 0 && (
        <section className="border-border bg-surface mt-4 rounded-xl border p-4">
          <h2 className="text-text-muted text-xs font-semibold tracking-wide uppercase">
            {t('checklist')}
          </h2>
          <ul className="mt-2 flex list-inside list-disc flex-col gap-1.5 text-sm">
            {analysis.checklist.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
