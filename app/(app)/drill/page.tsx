import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import DrillHome from '@/components/ptcg/DrillHome';
import PageTitle from '@/components/layout/PageTitle';
import type { DrillProfileRow } from '@/lib/types';

export async function generateMetadata() {
  const t = await getTranslations('drill');
  return { title: t('metaTitle') };
}

/** The profile list is cheap (name + a small cards/target_ids jsonb blob
 *  per profile) — unlike the old single-deck page, images are NOT
 *  fetched here. They're resolved on demand when a profile is started
 *  (see DrillHome.handleStart / GET /api/ptcg/drill-profiles/[id]),
 *  so opening the picker never pays for cards nobody is about to drill. */
export default async function DrillPage() {
  const supabase = await createClient();
  const t = await getTranslations('drill');

  const { data } = await supabase
    .from('ptcg_drill_profiles')
    .select('id, user_id, name, cards, target_ids, pokemon_number, created_at, updated_at')
    .order('created_at', { ascending: false });

  return (
    <section>
      <PageTitle title={t('pageTitle')} subtitle={t('pageSubtitle')} />
      <div className="mt-6 max-w-3xl">
        <DrillHome initialProfiles={(data ?? []) as DrillProfileRow[]} />
      </div>
    </section>
  );
}
