import { createClient } from '@/lib/supabase/server';
import VintedList from '@/components/vinted/VintedList';
import PageTitle from '@/components/layout/PageTitle';
import type { Card, Lot, CardListing, LotListing } from '@/lib/types';

export const metadata = {
  title: 'Vinted — I.R.I.S',
};

export default async function VintedPage() {
  const supabase = await createClient();

  const [forSaleResult, collectionResult, pokedexResult, configResult, lotsResult, cardListingsResult, lotListingsResult] = await Promise.all([
    supabase
      .from('cards')
      .select('*')
      .in('status', ['for_sale', 'sold'])
      .order('date_added', { ascending: true }),
    // Collection cards drive the per-row "stock count" chip in /vinted —
    // they're the extra physical copies of cards the user is also selling.
    supabase
      .from('cards')
      .select('*')
      .eq('status', 'collection')
      .order('date_added', { ascending: true }),
    supabase
      .from('cards')
      .select('pokemon_number')
      .eq('status', 'pokedex'),
    supabase.from('config').select('*'),
    supabase
      .from('lots')
      .select('*')
      .in('status', ['for_sale', 'sold'])
      .order('date_added', { ascending: true }),
    supabase.from('card_listings').select('*'),
    supabase.from('lot_listings').select('*'),
  ]);

  const fetchError =
    forSaleResult.error ?? collectionResult.error ?? pokedexResult.error ?? configResult.error ?? lotsResult.error ?? cardListingsResult.error ?? lotListingsResult.error;
  if (fetchError) {
    return (
      <section>
        <PageTitle title="Vinted" />
        <p className="text-red mt-4 text-sm">Erreur de chargement : {fetchError.message}</p>
      </section>
    );
  }

  const cards = (forSaleResult.data ?? []) as Card[];
  const collectionCards = (collectionResult.data ?? []) as Card[];
  const lots = (lotsResult.data ?? []) as Lot[];
  const cardListings = (cardListingsResult.data ?? []) as CardListing[];
  const lotListings = (lotListingsResult.data ?? []) as LotListing[];
  const registered = new Set<number>(
    (pokedexResult.data ?? []).map((r: { pokemon_number: number }) => r.pokemon_number),
  );
  const config = Object.fromEntries(
    (configResult.data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]),
  ) as Record<string, string>;

  const cardsWithListings = cards.map((c) => ({
    ...c,
    listings: cardListings.filter((l) => l.card_id === c.id),
  }));
  const lotsWithListings = lots.map((l) => ({
    ...l,
    listings: lotListings.filter((ll) => ll.lot_id === l.id),
  }));

  return (
    <section>
      <PageTitle
        title="Vinted"
        subtitle={`${cards.length} carte${cards.length > 1 ? 's' : ''} — tri FIFO`}
      />
      <div className="mt-6">
        <VintedList cards={cardsWithListings} lots={lotsWithListings} collectionCards={collectionCards} registered={registered} config={config} />
      </div>
    </section>
  );
}
