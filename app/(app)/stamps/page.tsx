import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/api/fetch-all';
import PageTitle from '@/components/layout/PageTitle';
import StampsShowroom, { type StampCard } from '@/components/stamps/StampsShowroom';

export async function generateMetadata() {
  const t = await getTranslations('stamps');
  return { title: t('metaTitle') };
}

/**
 * Stamps showroom — a binder-style gallery of every card whose `variant` is
 * 'stamp', across all statuses. Read-only; searchable by name + filterable by
 * language and rarity client-side.
 */
export default async function StampsPage() {
  const supabase = await createClient();
  const t = await getTranslations('stamps');

  const { data } = await fetchAllRows<StampCard>((from, to) =>
    supabase
      .from('cards')
      .select('id, card_name, pokemon_name, set_name, language, rarity, image_url, tcg_image_url')
      .eq('variant', 'stamp')
      .order('set_name', { ascending: true })
      .order('card_name', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  );
  const cards = data ?? [];

  return (
    <div className="space-y-6">
      <PageTitle title={t('pageTitle')} subtitle={t('pageSubtitle', { count: cards.length })} />
      <StampsShowroom cards={cards} />
    </div>
  );
}
