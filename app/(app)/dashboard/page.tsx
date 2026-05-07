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
  computeSparkline,
} from '@/lib/utils/dashboard-queries';
import { computeStockValue } from '@/lib/utils/stock-value';
import { computeRestockAlerts } from '@/lib/utils/restock-detection';
import DashboardKpiStrip from '@/components/dashboard/DashboardKpiStrip';
import DashboardPeriodTabs from '@/components/dashboard/DashboardPeriodTabs';
import RefreshButton from '@/components/dashboard/RefreshButton';
import CostBarChart from '@/components/dashboard/CostBarChart';
import StockValueLineChart from '@/components/dashboard/StockValueLineChart';
import RarityDonut from '@/components/dashboard/RarityDonut';
import ScanHeatmap from '@/components/dashboard/ScanHeatmap';
import TopRaresList from '@/components/dashboard/TopRaresList';
import RestockAlertsList from '@/components/dashboard/RestockAlertsList';
import LastSalesList from '@/components/dashboard/LastSalesList';
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
    sincePrevious: new Date(now - 2 * days * 86_400_000).toISOString(),
    since52w: new Date(now - 52 * 7 * 86_400_000).toISOString(),
    today: new Date(now),
  };
}

function formatEur(n: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(n);
}

function periodLabel(days: number): string {
  if (days === 7) return '7 jours';
  if (days === 30) return '30 jours';
  if (days === 90) return '90 jours';
  if (days === 365) return '1 an';
  return `${days} jours`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: periodRaw } = await searchParams;
  const period = parsePeriod(periodRaw);
  const days = periodDays(period);
  const { sincePeriod, sincePrevious, since52w, today } = timeWindow(days);

  const supabase = await createClient();

  const [
    { data: pricedCards },
    { data: ocrLogPeriod },
    { data: ocrLogPrevious },
    { data: stockSnapshots },
    { data: ocrLog52w },
    { data: restockRows },
    { data: lastSales },
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
      .from('ocr_usage_log')
      .select('created_at, engine, cost_eur')
      .gte('created_at', sincePrevious)
      .order('created_at', { ascending: true }),
    supabase
      .from('stock_value_snapshots')
      .select('*')
      .order('date', { ascending: true }),
    supabase
      .from('ocr_usage_log')
      .select('created_at')
      .gte('created_at', since52w),
    supabase
      .from('cards')
      .select('pokemon_number, pokemon_name, status')
      .not('pokemon_number', 'is', null),
    supabase
      .from('cards')
      .select('id, card_name, pokemon_name, image_url, tcg_image_url, rarity, sold_price, date_sold')
      .eq('status', 'sold')
      .not('date_sold', 'is', null)
      .order('date_sold', { ascending: false })
      .limit(10),
  ]);

  const cards = (pricedCards ?? []) as unknown as (Card & {
    cm_price_avg: number | null;
    cm_price_trend: number | null;
    cm_price_low: number | null;
  })[];

  const stockValue = computeStockValue(cards);
  const rarityCounts = buildRarityCounts(cards);
  const rarityValues = buildRarityValues(cards);
  const topRares = topRaresByPrice(cards, 10);
  const heatmap = buildHeatmapMatrix(ocrLog52w ?? [], today);
  const costDaily = aggregateCostByDay(ocrLogPeriod ?? [], today, days);
  const alerts = computeRestockAlerts(restockRows ?? []);

  // Compute sparklines and deltas for KPIs
  const costSparkline = computeSparkline(ocrLogPrevious ?? [], today, days, 'cost');
  const scansSparkline = computeSparkline(ocrLogPrevious ?? [], today, days, 'count');

  const kpiData = {
    valueStock: {
      label: 'Valeur stock',
      value: formatEur(stockValue.value_for_sale + stockValue.value_collection),
      href: '/stock',
      // No sparkline/delta — current state, not period-dependent
    },
    cost: {
      label: `Coût OCR ${periodLabel(days)}`,
      value: formatEur(costSparkline.total),
      href: '/dashboard',
      series: costSparkline.series,
      delta: costSparkline.delta,
    },
    scans: {
      label: `Scans ${periodLabel(days)}`,
      value: String(scansSparkline.total),
      href: '/submit',
      series: scansSparkline.series,
      delta: scansSparkline.delta,
    },
    restock: {
      label: 'Restock alerts',
      value: String(alerts.length),
      href: '/vinted',
      // No sparkline/delta — current state
    },
  };

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

      <DashboardKpiStrip
        valueStock={kpiData.valueStock}
        cost={kpiData.cost}
        scans={kpiData.scans}
        restock={kpiData.restock}
      />

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <CostBarChart data={costDaily} periodLabel={periodLabel(days)} />
        <StockValueLineChart data={stockSnapshots ?? []} />
        <RarityDonut counts={rarityCounts} values={rarityValues} />
        <ScanHeatmap matrix={heatmap} />
      </div>

      <div className="mt-4 grid gap-4">
        <TopRaresList cards={topRares} />
        <RestockAlertsList alerts={alerts} />
        <LastSalesList sales={lastSales ?? []} />
      </div>
    </section>
  );
}
