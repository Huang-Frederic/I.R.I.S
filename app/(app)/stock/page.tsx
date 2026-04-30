import { createClient } from '@/lib/supabase/server';
import StockList from '@/components/stock/StockList';
import type { Card } from '@/lib/types';

export const metadata = {
  title: 'Stock — I.R.I.S',
};

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

  const [collectionResult, forSaleResult] = await Promise.all([
    supabase
      .from('cards')
      .select('*')
      .eq('status', 'collection')
      .order('date_added', { ascending: false }),
    supabase
      .from('cards')
      .select('card_id_tcg, language, condition, variant')
      .eq('status', 'for_sale'),
  ]);

  const fetchError = collectionResult.error ?? forSaleResult.error;
  if (fetchError) {
    return (
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Stock</h1>
        <p className="text-red mt-4 text-sm">Erreur de chargement : {fetchError.message}</p>
      </section>
    );
  }

  const cards = (collectionResult.data ?? []) as Card[];
  const forSaleKeys = new Set<string>(
    ((forSaleResult.data ?? []) as ForSaleKeyRow[]).map(makeKey),
  );

  return (
    <section>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Stock</h1>
        <p className="text-text-muted mt-1 text-sm">
          {cards.length} carte{cards.length > 1 ? 's' : ''} en collection (pas en vente)
        </p>
      </div>
      <div className="mt-6">
        <StockList cards={cards} forSaleKeys={forSaleKeys} />
      </div>
    </section>
  );
}
