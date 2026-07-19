import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/api/fetch-all';
import PokedexGrid from '@/components/pokedex/PokedexGrid';
import PageTitle from '@/components/layout/PageTitle';
import { computeStockValue } from '@/lib/utils/stock-value';
import { formatEur } from '@/lib/utils/format-currency';
import type { Card } from '@/lib/types';

export async function generateMetadata() {
  const t = await getTranslations('pokedex');
  return { title: t('metaTitle') };
}

export default async function PokedexPage() {
  const supabase = await createClient();
  const t = await getTranslations('pokedex');
  // Pull every card the user owns that could appear on this page — the grid needs
  // 'pokedex' to know which slots are filled, plus 'for_sale' / 'collection' to feed
  // the drawer's "Replace by..." picker. Paginated: this set exceeds Supabase's
  // 1000-row response cap, which used to silently drop filled Pokédex slots.
  const { data, error } = await fetchAllRows((from, to) =>
    supabase
      .from('cards')
      .select('*')
      .in('status', ['pokedex', 'for_sale', 'collection'])
      .order('id', { ascending: true })
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

  const cards = (data ?? []) as Card[];
  const completed = cards.filter((c) => c.status === 'pokedex').length;
  const stockValue = computeStockValue(cards);

  return (
    <section>
      <PageTitle
        title={t('pageTitle')}
        subtitle={t('pageSubtitle', {
          collected: completed,
          total: 1025,
          pct: Math.round((completed / 1025) * 100),
          value: formatEur(stockValue.value_pokedex),
        })}
      />
      <div className="mt-6">
        <PokedexGrid cards={cards} />
      </div>
    </section>
  );
}
