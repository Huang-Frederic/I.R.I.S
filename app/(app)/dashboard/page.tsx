// app/(app)/dashboard/page.tsx
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
import DashboardPeriodTabs from '@/components/dashboard/DashboardPeriodTabs';
import RefreshButton from '@/components/dashboard/RefreshButton';
import DayDetailKpi from '@/components/dashboard/DayDetailKpi';
import DashboardKpiStrip from '@/components/dashboard/DashboardKpiStrip';
import CostBarChart from '@/components/dashboard/CostBarChart';
import StockValueLineChart from '@/components/dashboard/StockValueLineChart';
import RarityDonut from '@/components/dashboard/RarityDonut';
import ScanHeatmap from '@/components/dashboard/ScanHeatmap';
import TopRaresList from '@/components/dashboard/TopRaresList';
import LastSalesList from '@/components/dashboard/LastSalesList';
import PokedexCount from '@/components/dashboard/PokedexCount';
import type { Card } from '@/lib/types';

export const metadata = { title: 'Dashboard — I.R.I.S' };
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

function periodLabel(days: number): string {
  if (days === 7) return '7 jours';
  if (days === 30) return '30 jours';
  if (days === 90) return '90 jours';
  if (days === 365) return '1 an';
  return `${days} jours`;
}

function formatEur(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n);
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

  const [
    { data: pricedCards },
    { data: ocrLogPeriod },
    { data: stockSnapshots },
    { data: ocrLog24w },
    { data: cardsAdded24w },
    { data: lastSales },
    { data: pokedexRows },
    { data: lastPokedexAdds },
  ] = await Promise.all([
    supabase
      .from('cards')
      .select('id, status, rarity, cm_price_avg, cm_price_trend, cm_price_low, card_name, pokemon_name, pokemon_number, image_url, tcg_image_url')
      .in('status', ['for_sale', 'collection']),
    supabase
      .from('ocr_usage_log')
      .select('created_at, engine, cost_eur')
      .gte('created_at', sincePeriod)
      .order('created_at', { ascending: true }),
    supabase
      .from('stock_value_snapshots')
      .select('*')
      .order('date', { ascending: true }),
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
      .from('cards')
      .select('pokemon_number', { head: false })
      .eq('status', 'pokedex'),
    supabase
      .from('cards')
      .select('id, card_name, pokemon_name, pokemon_number, image_url, tcg_image_url, rarity, date_added')
      .eq('status', 'pokedex')
      .order('date_added', { ascending: false })
      .limit(3),
  ]);

  const cards = (pricedCards ?? []) as unknown as (Card & {
    cm_price_avg: number | null;
    cm_price_trend: number | null;
    cm_price_low: number | null;
  })[];

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

  return (
    <section>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-text-muted mt-1 text-sm">
            État de la collection et de la consommation OCR.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DashboardPeriodTabs current={period} />
          <RefreshButton />
        </div>
      </div>

      <div className="mt-6">
        <DayDetailKpi details={Object.fromEntries(dayDetails)} today={todayIso} />
      </div>

      <DashboardKpiStrip
        valueStock={{ label: 'Valeur stock', value: formatEur(stockValue.value_for_sale + stockValue.value_collection) }}
        cost={{ label: `Coût OCR ${periodLabel(days)}`, value: formatEur(costPeriodTotal) }}
        scans={{ label: `Scans ${periodLabel(days)}`, value: String(scansPeriodCount) }}
        cardsAdded={{ label: `Cartes ajoutées ${periodLabel(days)}`, value: String(cardsAddedPeriod) }}
      />

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <PokedexCount collected={pokedexCollected} adds={lastPokedexAdds ?? []} />
        <RarityDonut counts={rarityCounts} values={rarityValues} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <CostBarChart data={costDaily} periodLabel={periodLabel(days)} />
        <ScanHeatmap matrix={heatmap} details={Object.fromEntries(dayDetails)} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <StockValueLineChart data={stockSnapshots ?? []} />
        <TopRaresList cards={topRares} />
      </div>

      <div className="mt-4">
        <LastSalesList sales={lastSales ?? []} />
      </div>
    </section>
  );
}
