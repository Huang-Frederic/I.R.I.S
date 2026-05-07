// app/(app)/dashboard/page.tsx
import { createClient } from '@/lib/supabase/server';
import { buildRarityCounts, topRaresByPrice, buildHeatmapMatrix, aggregateCostByDay } from '@/lib/utils/dashboard-queries';
import { computeStockValue } from '@/lib/utils/stock-value';
import { computeRestockAlerts } from '@/lib/utils/restock-detection';
import DashboardKpiStrip from '@/components/dashboard/DashboardKpiStrip';
import CostBarChart from '@/components/dashboard/CostBarChart';
import StockValueLineChart from '@/components/dashboard/StockValueLineChart';
import RarityDonut from '@/components/dashboard/RarityDonut';
import ScanHeatmap from '@/components/dashboard/ScanHeatmap';
import TopRaresList from '@/components/dashboard/TopRaresList';
import RestockAlertsList from '@/components/dashboard/RestockAlertsList';
import type { Card } from '@/lib/types';

export const metadata = { title: 'Dashboard — I.R.I.S' };
export const revalidate = 60;

// Computed once per server-component request (not per render — server components
// don't re-render). Pulled out so the eslint react-hooks/purity rule doesn't
// trip on Date.now() inside the function body.
function timeWindow() {
  const now = Date.now();
  return {
    since30d: new Date(now - 30 * 86_400_000).toISOString(),
    since52w: new Date(now - 52 * 7 * 86_400_000).toISOString(),
    today: new Date(now),
  };
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { since30d, since52w, today } = timeWindow();

  const [
    { data: pricedCards },
    { data: ocrLog30d },
    { data: stockSnapshots },
    { data: ocrLog52w },
    { data: restockRows },
  ] = await Promise.all([
    supabase
      .from('cards')
      .select('id, status, rarity, cm_price_avg, cm_price_trend, cm_price_low, card_name, pokemon_name, pokemon_number, image_url, tcg_image_url')
      .in('status', ['for_sale', 'collection']),
    supabase
      .from('ocr_usage_log')
      .select('created_at, engine, cost_eur')
      .gte('created_at', since30d)
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
  ]);

  const cards = (pricedCards ?? []) as unknown as (Card & {
    cm_price_avg: number | null;
    cm_price_trend: number | null;
    cm_price_low: number | null;
  })[];
  const stockValue = computeStockValue(cards);
  const cost30dTotal = (ocrLog30d ?? []).reduce(
    (sum, e) => sum + Number(e.cost_eur ?? 0),
    0,
  );
  const scans30d = (ocrLog30d ?? []).length;
  const rarityCounts = buildRarityCounts(cards);
  const topRares = topRaresByPrice(cards, 10);
  const heatmap = buildHeatmapMatrix(ocrLog52w ?? [], today);
  const costDaily = aggregateCostByDay(ocrLog30d ?? [], today);
  const alerts = computeRestockAlerts(restockRows ?? []);

  return (
    <section>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-text-muted mt-1 text-sm">
          État de la collection et de la consommation OCR.
        </p>
      </div>

      <DashboardKpiStrip
        valueStock={stockValue.value_for_sale + stockValue.value_collection}
        cost30d={cost30dTotal}
        scans30d={scans30d}
        restockCount={alerts.length}
      />

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <CostBarChart data={costDaily} />
        <StockValueLineChart data={stockSnapshots ?? []} />
        <RarityDonut data={rarityCounts} />
        <ScanHeatmap matrix={heatmap} />
      </div>

      <div className="mt-4 grid gap-4">
        <TopRaresList cards={topRares} />
        <RestockAlertsList alerts={alerts} />
      </div>
    </section>
  );
}
