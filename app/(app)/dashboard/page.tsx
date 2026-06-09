import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import {
  buildRarityCounts,
  buildRarityValues,
  topRaresByPrice,
  buildHeatmapMatrix,
  aggregateCostByDay,
  parsePeriod,
  periodDays,
  buildDayDetails,
} from '@/lib/utils/dashboard-queries';
import { computeStockValue } from '@/lib/utils/stock-value';
import { formatEur } from '@/lib/utils/format-currency';
import PageTitle from '@/components/layout/PageTitle';
import DashboardPeriodTabs from '@/components/dashboard/DashboardPeriodTabs';
import RefreshButton from '@/components/dashboard/RefreshButton';
import DayDetailKpi from '@/components/dashboard/DayDetailKpi';
import DashboardKpiStrip from '@/components/dashboard/DashboardKpiStrip';
import CostBarChart from '@/components/dashboard/CostBarChart';
import RarityDonut from '@/components/dashboard/RarityDonut';
import ScanHeatmap from '@/components/dashboard/ScanHeatmap';
import TopRaresList from '@/components/dashboard/TopRaresList';
import LastSalesList from '@/components/dashboard/LastSalesList';
import VintedPostsWidget from '@/components/dashboard/VintedPostsWidget';
import PokedexCount from '@/components/dashboard/PokedexCount';
import type { Card } from '@/lib/types';

export async function generateMetadata() {
  const t = await getTranslations('dashboard');
  return { title: t('metaTitle') };
}

export const revalidate = 60;

// Computed once per server-component request (not per render — server components
// don't re-render). Pulled out so the eslint react-hooks/purity rule doesn't
// trip on Date.now() inside the function body.
function timeWindow(days: number) {
  const now = Date.now();
  return {
    sincePeriod: new Date(now - days * 86_400_000).toISOString(),
    since24w: new Date(now - 24 * 7 * 86_400_000).toISOString(),
    today: new Date(now),
  };
}

function periodLabelKey(days: number): { key: 'periodLabel7' | 'periodLabel30' | 'periodLabel90' | 'periodLabel365' | 'periodLabelOther'; values?: { days: number } } {
  if (days === 7) return { key: 'periodLabel7' };
  if (days === 30) return { key: 'periodLabel30' };
  if (days === 90) return { key: 'periodLabel90' };
  if (days === 365) return { key: 'periodLabel365' };
  return { key: 'periodLabelOther', values: { days } };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: periodRaw } = await searchParams;
  const period = parsePeriod(periodRaw);
  const days = periodDays(period);
  const { sincePeriod, since24w, today } = timeWindow(days);

  const supabase = await createClient();
  const t = await getTranslations('dashboard');
  const { data: { user } } = await supabase.auth.getUser();

  const [
    { data: pricedCards },
    { data: ocrLogPeriod },
    { data: ocrLog24w },
    { data: cardsAdded24w },
    { data: lastSales },
    { data: lastLots },
    { data: pokedexRows },
    { data: lastPokedexAdds },
    { data: vintedPostedToday },
  ] = await Promise.all([
    supabase
      .from('cards')
      .select('id, status, rarity, cm_price_avg, cm_price_trend, cm_price_low, card_name, pokemon_name, pokemon_number, image_url, tcg_image_url')
      // Include pokedex cards in stock value / rarity stats / top rares —
      // they're part of the collection's intrinsic value even if not for sale.
      .in('status', ['for_sale', 'collection', 'pokedex']),
    supabase
      .from('ocr_usage_log')
      .select('created_at, engine, cost_eur')
      .gte('created_at', sincePeriod)
      .order('created_at', { ascending: true }),
    supabase
      .from('ocr_usage_log')
      .select('created_at, engine, cost_eur, tokens_in, tokens_out')
      .gte('created_at', since24w),
    supabase
      .from('cards')
      .select('date_added')
      .gte('date_added', since24w),
    supabase
      .from('cards')
      .select('id, card_name, pokemon_name, image_url, tcg_image_url, rarity, sold_price, date_sold')
      .eq('status', 'sold')
      .not('date_sold', 'is', null)
      .order('date_sold', { ascending: false })
      .limit(10),
    supabase
      .from('lots')
      .select('id, name, photo_urls, sold_price, date_sold, date_added, language, condition')
      .eq('status', 'sold')
      .order('date_sold', { ascending: false, nullsFirst: false })
      .limit(10),
    supabase
      .from('cards')
      .select('pokemon_number', { head: false })
      .eq('status', 'pokedex'),
    supabase
      .from('cards')
      .select('id, card_name, pokemon_name, pokemon_number, image_url, tcg_image_url, rarity, date_added')
      .eq('status', 'pokedex')
      .order('date_added', { ascending: false })
      .limit(3),
    supabase
      .from('card_listings')
      .select('vinted_listing_id, vinted_posted_at, cards(id, card_name, image_url, tcg_image_url)')
      .eq('user_id', user?.id ?? '')
      .not('vinted_listing_id', 'is', null)
      .gte('vinted_posted_at', new Date().toISOString().slice(0, 10))
      .order('vinted_posted_at', { ascending: false }),
  ]);

  const cards = (pricedCards ?? []) as unknown as (Card & {
    cm_price_avg: number | null;
    cm_price_trend: number | null;
    cm_price_low: number | null;
  })[];

  type SoldCardItem = NonNullable<typeof lastSales>[number] & { kind: 'card' };
  type SoldLotItem = { kind: 'lot'; id: string; name: string; photo_urls: string[]; sold_price: number | null; date_sold: string | null; date_added: string; language: string | null; condition: string | null };
  type SoldItem = SoldCardItem | SoldLotItem;
  type PostedCard = {
    id: string;
    card_name: string;
    vinted_listing_id: string;
    vinted_posted_at: string;
    image_url: string | null;
    tcg_image_url: string | null;
  };

  const postedCards: PostedCard[] = (vintedPostedToday ?? [])
    .filter((l) => l.cards)
    .map((l) => {
      const c = l.cards as { id: string; card_name: string; image_url: string | null; tcg_image_url: string | null };
      return {
        id: c.id,
        card_name: c.card_name,
        image_url: c.image_url,
        tcg_image_url: c.tcg_image_url,
        vinted_listing_id: l.vinted_listing_id!,
        vinted_posted_at: l.vinted_posted_at!,
      };
    });

  const soldCards: SoldItem[] = (lastSales ?? []).map((s) => ({ kind: 'card' as const, ...s }));
  const soldLots: SoldItem[] = (lastLots ?? []).map((l) => ({ kind: 'lot' as const, ...l }));
  const sortKey = (s: SoldItem) =>
    s.date_sold ?? (s.kind === 'lot' ? s.date_added : '');
  const allSales = [...soldCards, ...soldLots]
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)))
    .slice(0, 15);

  const rarityCounts = buildRarityCounts(cards);
  const rarityValues = buildRarityValues(cards);
  const topRares = topRaresByPrice(cards, 10);
  const heatmap = buildHeatmapMatrix(ocrLog24w ?? [], today);
  const dayDetails = buildDayDetails(ocrLog24w ?? [], cardsAdded24w ?? []);
  const costDaily = aggregateCostByDay(ocrLogPeriod ?? [], today, days);
  const pokedexCollected = (pokedexRows ?? []).length;
  const todayIso = today.toISOString().slice(0, 10);

  // KPI strip data
  const stockValue = computeStockValue(cards);
  const costPeriodTotal = (ocrLogPeriod ?? []).reduce((s, e) => s + Number(e.cost_eur ?? 0), 0);
  const scansPeriodCount = (ocrLogPeriod ?? []).length;
  const cardsAddedPeriod = (cardsAdded24w ?? []).filter((c) => c.date_added >= sincePeriod).length;

  const periodKey = periodLabelKey(days);
  const periodText = periodKey.values ? t(periodKey.key, periodKey.values) : t(periodKey.key);

  return (
    <section>
      <PageTitle
        title={t('pageTitle')}
        subtitle={t('pageSubtitle')}
        controls={
          <>
            <DashboardPeriodTabs current={period} />
            <RefreshButton />
          </>
        }
      />

      <div className="mt-6">
        <DayDetailKpi details={Object.fromEntries(dayDetails)} today={todayIso} />
      </div>

      <DashboardKpiStrip
        valueStock={{
          // Stock = for_sale + collection. Pokédex value is shown separately
          // on the Pokédex KPI card so a personal collection doesn't inflate
          // the "what I could sell" figure.
          label: t('kpiStockValue'),
          value: formatEur(stockValue.value_for_sale + stockValue.value_collection),
        }}
        cost={{ label: t('kpiOcrCost', { period: periodText }), value: formatEur(costPeriodTotal) }}
        scans={{ label: t('kpiScans', { period: periodText }), value: String(scansPeriodCount) }}
        cardsAdded={{ label: t('kpiCardsAdded', { period: periodText }), value: String(cardsAddedPeriod) }}
      />

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <PokedexCount collected={pokedexCollected} value={stockValue.value_pokedex} adds={lastPokedexAdds ?? []} />
        <RarityDonut counts={rarityCounts} values={rarityValues} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <CostBarChart data={costDaily} periodLabel={periodText} />
        <ScanHeatmap matrix={heatmap} details={Object.fromEntries(dayDetails)} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <LastSalesList
              sales={allSales}
              storagePublicUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}
            />
        <TopRaresList cards={topRares} />
      </div>

      <div className="mt-4">
        <VintedPostsWidget cards={postedCards} />
      </div>
    </section>
  );
}
