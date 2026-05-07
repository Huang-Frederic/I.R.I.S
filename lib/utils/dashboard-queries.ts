import type { CardRarity } from '@/lib/types';

export type DashboardPeriod = '7d' | '30d' | '90d' | '365d';

export function parsePeriod(raw: string | string[] | undefined): DashboardPeriod {
  if (typeof raw !== 'string') return '30d';
  if (['7d', '30d', '90d', '365d'].includes(raw)) return raw as DashboardPeriod;
  return '30d';
}

export function periodDays(p: DashboardPeriod): number {
  return ({ '7d': 7, '30d': 30, '90d': 90, '365d': 365 } as const)[p];
}

export function buildRarityCounts(
  cards: readonly { rarity: CardRarity }[],
): { rarity: CardRarity; count: number }[] {
  const counts = new Map<CardRarity, number>();
  for (const c of cards) {
    counts.set(c.rarity, (counts.get(c.rarity) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([rarity, count]) => ({ rarity, count }))
    .sort((a, b) => b.count - a.count);
}

interface PricedCard {
  cm_price_avg: number | null;
  cm_price_trend: number | null;
  cm_price_low: number | null;
}

function priceOf(card: PricedCard): number | null {
  return card.cm_price_avg ?? card.cm_price_trend ?? card.cm_price_low;
}

export function topRaresByPrice<T extends PricedCard>(
  cards: readonly T[],
  limit: number,
): T[] {
  return cards
    .filter((c) => priceOf(c) !== null)
    .map((c) => ({ card: c, price: priceOf(c)! }))
    .sort((a, b) => b.price - a.price)
    .slice(0, limit)
    .map(({ card }) => card);
}

/**
 * Builds a 52×7 matrix of scan counts.
 * Row 0 = current week, row 51 = 51 weeks ago.
 * Column 0 = Monday, column 6 = Sunday.
 * `anchor` is "today" — week boundaries computed from it.
 */
export function buildHeatmapMatrix(
  events: readonly { created_at: string }[],
  anchor: Date,
): number[][] {
  const matrix: number[][] = Array.from({ length: 52 }, () => Array(7).fill(0));

  // Find the Monday of the anchor week (UTC).
  const anchorDay = (anchor.getUTCDay() + 6) % 7; // 0 = Mon, 6 = Sun
  const monday0 = new Date(anchor);
  monday0.setUTCDate(anchor.getUTCDate() - anchorDay);
  monday0.setUTCHours(0, 0, 0, 0);

  for (const ev of events) {
    const ts = new Date(ev.created_at);
    // Day of week in our local Mon=0..Sun=6 system:
    const dow = (ts.getUTCDay() + 6) % 7;
    // Find the Monday of the event's week:
    const tsMidnight = new Date(ts);
    tsMidnight.setUTCHours(0, 0, 0, 0);
    const tsMonday = new Date(tsMidnight);
    tsMonday.setUTCDate(tsMidnight.getUTCDate() - dow);
    const weeksAgo = Math.round((monday0.getTime() - tsMonday.getTime()) / (7 * 86_400_000));
    if (weeksAgo >= 0 && weeksAgo < 52) {
      matrix[weeksAgo][dow] += 1;
    }
  }
  return matrix;
}

export interface DailyCostAgg {
  day: string;
  gemini: number;
  vision: number;
}

/**
 * Aggregates per-scan OCR cost rows into a daily series.
 * `anchor` is "today" — required as a parameter so the same series can be
 * computed in SSR + client without Date.now() drift causing hydration errors.
 * `days` is the number of days to aggregate (inclusive of anchor day).
 */
export function aggregateCostByDay(
  entries: readonly { created_at: string; engine: 'gemini' | 'vision'; cost_eur: number | string }[],
  anchor: Date,
  days: number,
): DailyCostAgg[] {
  const map = new Map<string, DailyCostAgg>();
  const anchorMs = anchor.getTime();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(anchorMs - i * 86_400_000).toISOString().slice(0, 10);
    map.set(d, { day: d, gemini: 0, vision: 0 });
  }
  for (const e of entries) {
    const day = e.created_at.slice(0, 10);
    const row = map.get(day);
    if (!row) continue;
    row[e.engine] += Number(e.cost_eur);
  }
  return Array.from(map.values());
}

export interface SparklineResult {
  /** N points (bucketed scans count or cost), oldest first */
  series: number[];
  /** Sum over the chosen period */
  total: number;
  /** Sum over the previous period of equal length */
  previousTotal: number;
  /** Percentage change vs previous period; null if previous was 0 */
  delta: number | null;
}

/**
 * Computes sparkline series + total + delta for a given period.
 * Always produces 7 buckets. Each bucket spans `days/7` days.
 * `metric` determines whether to count events or sum their cost.
 */
export function computeSparkline(
  events: readonly { created_at: string; cost_eur?: number | string }[],
  anchor: Date,
  days: number,
  metric: 'count' | 'cost',
): SparklineResult {
  const BUCKETS = 7;
  const bucketSize = days / BUCKETS; // days per bucket
  const anchorMs = anchor.getTime();

  const series: number[] = Array(BUCKETS).fill(0);
  let total = 0;
  let previousTotal = 0;

  for (const ev of events) {
    const ts = new Date(ev.created_at).getTime();
    const ageMs = anchorMs - ts;
    const ageDays = ageMs / 86_400_000;

    const value = metric === 'cost' ? Number(ev.cost_eur ?? 0) : 1;

    // Current period: 0 to days
    if (ageDays >= 0 && ageDays < days) {
      total += value;
      const bucketIdx = Math.floor(ageDays / bucketSize);
      if (bucketIdx >= 0 && bucketIdx < BUCKETS) {
        // Reverse so oldest is first
        series[BUCKETS - 1 - bucketIdx] += value;
      }
    }

    // Previous period: days to 2*days
    if (ageDays >= days && ageDays < 2 * days) {
      previousTotal += value;
    }
  }

  const delta = previousTotal === 0 ? null : ((total - previousTotal) / previousTotal) * 100;

  return { series, total, previousTotal, delta };
}
