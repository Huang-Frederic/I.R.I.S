import type { DeltaMatrixData, PriceHistoryPoint, PriceTrend } from '@/lib/types/price-history';

const STABLE_THRESHOLD_EUR = 0.01;
const TIER_TOLERANCE_DAYS = 2;
const CASCADE_TIERS: PriceTrend['period_days'][] = [1, 3, 7, 30, 90];

/**
 * Cascade J-1 → J-3 → J-7 → J-30 → J-90: returns the first non-stable delta
 * found, or null if no tier yields a meaningful change. Each tier accepts a
 * point within ±2 days of the nominal date. When a point is within tolerance
 * of multiple tiers, it is exclusively assigned to the cascade tier whose
 * nominal date is closest (tie-break: prefer the larger tier so a J-5 point
 * counts as J-7, not J-3). When several points land on the same tier, the
 * chronologically oldest one wins.
 */
export function computeCascadeTrend(
  points: PriceHistoryPoint[],
  currentPrice: number,
  todayIso: string,
): PriceTrend | null {
  if (points.length < 1) return null;
  const buckets = assignPointsToCascadeTiers(points, todayIso);
  for (const tier of CASCADE_TIERS) {
    const base = pickOldest(buckets.get(tier) ?? []);
    if (base == null) continue;
    if (Math.abs(currentPrice - base) < STABLE_THRESHOLD_EUR) continue;
    return {
      delta_eur: currentPrice - base,
      delta_pct: ((currentPrice - base) / base) * 100,
      period_days: tier,
      base_price: base,
      current_price: currentPrice,
    };
  }
  return null;
}

/** Multi-period view used in the detail modal. Each tier is independent. */
export function computeMultiPeriodDeltas(
  points: PriceHistoryPoint[],
  currentPrice: number,
  todayIso: string,
): DeltaMatrixData {
  const cell = (days: PriceTrend['period_days']): PriceTrend | null => {
    const base = findPointForTier(points, todayIso, days);
    if (base == null) return null;
    return {
      delta_eur: currentPrice - base,
      delta_pct: base === 0 ? 0 : ((currentPrice - base) / base) * 100,
      period_days: days,
      base_price: base,
      current_price: currentPrice,
    };
  };
  return {
    d7: cell(7),
    d30: cell(30),
    d90: cell(90),
    d365: cell(365),  // 1 year tier (DeltaMatrix only)
  };
}

/** Return the cm_price_avg of the point closest to the nominal tier date,
 *  within ±TIER_TOLERANCE_DAYS. Returns null if none qualifies. Used by the
 *  multi-period matrix where each tier is independent (no exclusive
 *  assignment between tiers). */
function findPointForTier(
  points: PriceHistoryPoint[],
  todayIso: string,
  tierDays: number,
): number | null {
  const nominalMs = nominalMsFor(todayIso, tierDays);
  let bestPoint: PriceHistoryPoint | null = null;
  let bestDistance = Infinity;
  for (const p of points) {
    if (p.cm_price_avg == null) continue;
    const pDate = parseIsoDateUtcMs(p.bucket_date);
    const distDays = Math.abs(pDate - nominalMs) / 86_400_000;
    if (distDays > TIER_TOLERANCE_DAYS) continue;
    if (distDays < bestDistance) {
      bestDistance = distDays;
      bestPoint = p;
    }
  }
  return bestPoint?.cm_price_avg ?? null;
}

/** Group points by their best cascade tier. A point goes to the cascade tier
 *  whose nominal date is within ±TIER_TOLERANCE_DAYS AND closest; ties are
 *  broken in favor of the LARGER tier (so a J-5 point belongs to J-7, not
 *  J-3). Points outside every tier window are dropped. */
function assignPointsToCascadeTiers(
  points: PriceHistoryPoint[],
  todayIso: string,
): Map<PriceTrend['period_days'], PriceHistoryPoint[]> {
  const buckets = new Map<PriceTrend['period_days'], PriceHistoryPoint[]>();
  const tierMs = CASCADE_TIERS.map((t) => ({ tier: t, ms: nominalMsFor(todayIso, t) }));
  for (const p of points) {
    if (p.cm_price_avg == null) continue;
    const pMs = parseIsoDateUtcMs(p.bucket_date);
    let bestTier: PriceTrend['period_days'] | null = null;
    let bestDist = Infinity;
    for (const { tier, ms } of tierMs) {
      const dist = Math.abs(pMs - ms) / 86_400_000;
      if (dist > TIER_TOLERANCE_DAYS) continue;
      // Strict `<` keeps the first (smaller) tier on ties, then `<=` overrides
      // it so the larger tier wins when distances are exactly equal.
      if (bestTier == null || dist < bestDist || (dist === bestDist && tier > bestTier)) {
        bestDist = dist;
        bestTier = tier;
      }
    }
    if (bestTier == null) continue;
    const arr = buckets.get(bestTier) ?? [];
    arr.push(p);
    buckets.set(bestTier, arr);
  }
  return buckets;
}

/** From a non-empty list of points, return the cm_price_avg of the one with
 *  the earliest bucket_date (chronologically oldest). */
function pickOldest(points: PriceHistoryPoint[]): number | null {
  if (points.length === 0) return null;
  let best: PriceHistoryPoint | null = null;
  let bestMs = Infinity;
  for (const p of points) {
    const ms = parseIsoDateUtcMs(p.bucket_date);
    if (ms < bestMs) {
      bestMs = ms;
      best = p;
    }
  }
  return best?.cm_price_avg ?? null;
}

function nominalMsFor(todayIso: string, tierDays: number): number {
  const d = new Date(todayIso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - tierDays);
  return d.getTime();
}

function parseIsoDateUtcMs(isoDate: string): number {
  return new Date(isoDate + 'T00:00:00Z').getTime();
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** Coefficient of variation expressed as a percentage. Null for <2 points. */
export function volatilityPct(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return (Math.sqrt(variance) / mean) * 100;
}

/** Compute Min, Max, Median, Volatility for a series. Used by PriceStatsGrid. */
export function summarizePrices(points: PriceHistoryPoint[]) {
  const values = points
    .map((p) => p.cm_price_avg)
    .filter((v): v is number => v != null);
  if (values.length === 0) {
    return { min: null, max: null, median: null, volatility: null };
  }
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    median: median(values),
    volatility: volatilityPct(values),
  };
}
