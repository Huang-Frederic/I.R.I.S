import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import StockList from '@/components/stock/StockList';
import PageTitle from '@/components/layout/PageTitle';
import type { Card } from '@/lib/types';

export async function generateMetadata() {
  const t = await getTranslations('stock');
  return { title: t('metaTitle') };
}

interface ForSaleKeyRow {
  card_id_tcg: string | null;
  language: string;
  condition: string;
  variant: string | null;
}

function makeKey(row: { card_id_tcg: string | null; language: string; condition: string; variant: string | null }): string {
  return `${row.card_id_tcg ?? ''}|${row.language}|${row.condition}|${row.variant ?? 'standard'}`;
}

export default async function StockPage() {
  const supabase = await createClient();
  const t = await getTranslations('stock');

  // The user wants Stock rows ordered "oldest first" so the original entry
  // sits at the top of each group's history (date_added ASC). Grouping
  // happens client-side.
  const [collectionResult, forSaleResult, pokedexResult] = await Promise.all([
    supabase
      .from('cards')
      .select('*')
      .eq('status', 'collection')
      .order('date_added', { ascending: true }),
    supabase
      .from('cards')
      .select('card_id_tcg, language, condition, variant')
      .eq('status', 'for_sale'),
    supabase
      .from('cards')
      .select('pokemon_number')
      .eq('status', 'pokedex'),
  ]);

  const fetchError = collectionResult.error ?? forSaleResult.error ?? pokedexResult.error;
  if (fetchError) {
    return (
      <section>
        <PageTitle title={t('pageTitle')} />
        <p className="text-red mt-4 text-sm">{t('loadError', { message: fetchError.message })}</p>
      </section>
    );
  }

  const cards = (collectionResult.data ?? []) as Card[];
  const forSaleKeys = new Set<string>(
    ((forSaleResult.data ?? []) as ForSaleKeyRow[]).map(makeKey),
  );
  const registered = new Set<number>(
    (pokedexResult.data ?? [])
      .map((r) => r.pokemon_number)
      .filter((n): n is number => typeof n === 'number'),
  );

  return (
    <section>
      <PageTitle
        title={t('pageTitle')}
        subtitle={t('pageSubtitle', { count: cards.length })}
      />
      <div className="mt-6">
        <StockList cards={cards} forSaleKeys={forSaleKeys} registered={registered} />
      </div>
    </section>
  );
}
