import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/api/fetch-all';
import VintedList from '@/components/vinted/VintedList';
import PageTitle from '@/components/layout/PageTitle';
import type { Card, Lot, CardListing, LotListing } from '@/lib/types';

export async function generateMetadata() {
  const t = await getTranslations('vinted');
  return { title: t('metaTitle') };
}

export default async function VintedPage() {
  const t = await getTranslations('vinted');
  const supabase = await createClient();

  // Unbounded queries go through fetchAllRows — Supabase truncates any
  // response at 1000 rows, which would silently drop listings/cards here.
  const [forSaleResult, soldResult, collectionResult, pokedexResult, configResult, forSaleLotsResult, soldLotsResult, cardListingsResult, lotListingsResult] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase
        .from('cards')
        .select('*')
        .eq('status', 'for_sale')
        .order('date_added', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    // Cap sold cards to the 40 most recent — the full history can be hundreds
    // of rows and bloats the initial HTML payload (→ slow iOS hydration).
    supabase
      .from('cards')
      .select('*')
      .eq('status', 'sold')
      .order('date_sold', { ascending: false })
      .limit(40),
    // Collection cards drive the per-row "stock count" chip in /vinted —
    // they're the extra physical copies of cards the user is also selling.
    fetchAllRows((from, to) =>
      supabase
        .from('cards')
        .select('*')
        .eq('status', 'collection')
        .order('date_added', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase
        .from('cards')
        .select('pokemon_number')
        .eq('status', 'pokedex')
        .order('id', { ascending: true })
        .range(from, to),
    ),
    supabase.from('config').select('*'),
    fetchAllRows((from, to) =>
      supabase
        .from('lots')
        .select('*')
        .eq('status', 'for_sale')
        .order('date_added', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    supabase
      .from('lots')
      .select('*')
      .eq('status', 'sold')
      .order('date_sold', { ascending: false })
      .limit(20),
    fetchAllRows((from, to) =>
      supabase
        .from('card_listings')
        .select('card_id, user_id, listed_at, vinted_listing_id, vinted_posted_at')
        .order('card_id', { ascending: true })
        .order('user_id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase
        .from('lot_listings')
        .select('lot_id, user_id, listed_at, vinted_listing_id, vinted_posted_at')
        .order('lot_id', { ascending: true })
        .order('user_id', { ascending: true })
        .range(from, to),
    ),
  ]);

  const fetchError =
    forSaleResult.error ?? soldResult.error ?? collectionResult.error ?? pokedexResult.error ?? configResult.error ?? forSaleLotsResult.error ?? soldLotsResult.error ?? cardListingsResult.error ?? lotListingsResult.error;
  if (fetchError) {
    return (
      <section>
        <PageTitle title={t('pageTitle')} />
        <p className="text-red mt-4 text-sm">{t('loadError', { message: fetchError.message })}</p>
      </section>
    );
  }

  const cards = [
    ...(forSaleResult.data ?? []),
    ...(soldResult.data ?? []),
  ] as Card[];
  const collectionCards = (collectionResult.data ?? []) as Card[];
  const lots = [
    ...(forSaleLotsResult.data ?? []),
    ...(soldLotsResult.data ?? []),
  ] as Lot[];
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

  const currentUserId = (await supabase.auth.getUser()).data.user?.id ?? '';
  const allowedVintedIds = (process.env.VINTED_USER_IDS ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const vintedEnabled = allowedVintedIds.includes(currentUserId);

  return (
    <section>
      <PageTitle
        title={t('pageTitle')}
        subtitle={t('pageSubtitle', { count: cards.length })}
      />
      <div className="mt-6">
        <VintedList cards={cardsWithListings} lots={lotsWithListings} collectionCards={collectionCards} registered={registered} config={config} vintedEnabled={vintedEnabled} />
      </div>
    </section>
  );
}
