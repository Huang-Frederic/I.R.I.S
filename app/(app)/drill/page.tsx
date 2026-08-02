import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { resolveCards } from '@/lib/ptcg/cards';
import { DRILL_DECK } from '@/lib/ptcg/drill-deck';
import PtcgDrill from '@/components/ptcg/PtcgDrill';
import PageTitle from '@/components/layout/PageTitle';
import type { PtcgCardRow } from '@/lib/types';

export async function generateMetadata() {
  const t = await getTranslations('drill');
  return { title: t('metaTitle') };
}

/** Card images come from the same ptcg_cards cache the replay uses. A card
 *  never seen in an imported game yet is resolved from TCGdex once, then
 *  cached — failures degrade to a text tile, never to an error. */
export default async function DrillPage() {
  const supabase = await createClient();
  const t = await getTranslations('drill');

  const ids = DRILL_DECK.map((c) => c.id);
  const { data: rows } = await supabase
    .from('ptcg_cards')
    .select('ptcgl_id, image_url')
    .in('ptcgl_id', ids);

  const images: Record<string, string> = {};
  for (const r of (rows ?? []) as Pick<PtcgCardRow, 'ptcgl_id' | 'image_url'>[]) {
    if (r.image_url) images[r.ptcgl_id] = r.image_url;
  }

  // Best-effort backfill for cards the games have never shown (e.g. a fresh
  // tech): resolve once, cache for next time, and shrug on failure.
  const missing = DRILL_DECK.filter((c) => !images[c.id]);
  if (missing.length) {
    try {
      const { cards } = await resolveCards(
        missing.map((c) => ({ id: c.id, name: c.name })),
        {},
      );
      const fresh = Object.values(cards);
      if (fresh.length) {
        await supabase.from('ptcg_cards').upsert(fresh, { onConflict: 'ptcgl_id,language' });
        for (const c of fresh) if (c.image_url) images[c.ptcgl_id] = c.image_url;
      }
    } catch {
      // Text tiles are an acceptable fallback; the drill trains counting.
    }
  }

  return (
    <section>
      <PageTitle title={t('pageTitle')} subtitle={t('pageSubtitle')} />
      <div className="mt-6 max-w-3xl">
        <PtcgDrill images={images} />
      </div>
    </section>
  );
}
