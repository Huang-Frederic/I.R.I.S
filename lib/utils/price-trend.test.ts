import { describe, it, expect } from 'vitest';
import {
  computeCascadeTrend,
  computeMultiPeriodDeltas,
  median,
  volatilityPct,
} from './price-trend';
import type { PriceHistoryPoint } from '@/lib/types/price-history';

const today = '2026-05-13';

function pt(date: string, avg: number): PriceHistoryPoint {
  return {
    card_id: 'c1',
    bucket_date: date,
    granularity: 'daily',
    cm_price_low: null,
    cm_price_trend: null,
    cm_price_avg: avg,
    source_freshness_days: 0,
  };
}

describe('computeCascadeTrend', () => {
  it('returns null when fewer than 2 points', () => {
    expect(computeCascadeTrend([pt(today, 4.0)], 4.0, today)).toBeNull();
    expect(computeCascadeTrend([], 4.0, today)).toBeNull();
  });

  it('returns null when all tiers are within 1 cent of current', () => {
    const points = [
      pt('2026-05-12', 4.005),  // J-1, delta = 0.005 < 0.01
      pt('2026-05-10', 4.005),  // J-3
    ];
    expect(computeCascadeTrend(points, 4.00, today)).toBeNull();
  });

  it('picks J-1 when J-1 has a usable delta', () => {
    const points = [pt('2026-05-12', 3.80), pt('2026-05-06', 3.50)];
    const trend = computeCascadeTrend(points, 4.00, today);
    expect(trend).not.toBeNull();
    expect(trend!.period_days).toBe(1);
    expect(trend!.delta_eur).toBeCloseTo(0.20, 2);
    expect(trend!.delta_pct).toBeCloseTo(5.26, 1);
  });

  it('falls through to J-7 when J-1 and J-3 are stable', () => {
    const points = [
      pt('2026-05-12', 4.00),  // J-1: stable
      pt('2026-05-10', 4.00),  // J-3: stable
      pt('2026-05-06', 3.50),  // J-7: -12.5%
    ];
    const trend = computeCascadeTrend(points, 4.00, today);
    expect(trend!.period_days).toBe(7);
  });

  it('tolerates ±2 day gap on each tier', () => {
    // J-7 nominal = 2026-05-06; provide 2026-05-08 (J-5)
    const points = [pt('2026-05-08', 3.50)];
    const trend = computeCascadeTrend(points, 4.00, today);
    expect(trend!.period_days).toBe(7);
  });

  it('uses the chronologically earliest point on each tier when several match', () => {
    // J-7 ±2: candidates at J-5 (3.90) and J-9 (3.50). Pick the older one
    // (closer to the nominal tier date being looked for).
    const points = [pt('2026-05-04', 3.50), pt('2026-05-08', 3.90)];
    const trend = computeCascadeTrend(points, 4.00, today);
    expect(trend!.period_days).toBe(7);
    // J-9 (2026-05-04) is closer to J-7 nominal than J-5 — picks 3.50
    expect(trend!.base_price).toBeCloseTo(3.50, 2);
  });
});

describe('computeMultiPeriodDeltas', () => {
  it('returns 4 cells, null when no point in tier', () => {
    const points = [pt('2026-05-12', 3.80)];   // only J-1 data
    const deltas = computeMultiPeriodDeltas(points, 4.00, today);
    expect(deltas.d7).toBeNull();
    expect(deltas.d30).toBeNull();
    expect(deltas.d90).toBeNull();
    expect(deltas.d365).toBeNull();
  });

  it('fills cells when tier has a point', () => {
    const points = [
      pt('2026-05-06', 3.80),   // J-7
      pt('2026-04-13', 3.50),   // J-30
    ];
    const deltas = computeMultiPeriodDeltas(points, 4.00, today);
    expect(deltas.d7).not.toBeNull();
    expect(deltas.d7!.period_days).toBe(7);
    expect(deltas.d30).not.toBeNull();
    expect(deltas.d30!.period_days).toBe(30);
  });
});

describe('median', () => {
  it('handles odd count', () => {
    expect(median([1, 2, 3])).toBe(2);
  });
  it('handles even count', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it('returns null for empty', () => {
    expect(median([])).toBeNull();
  });
});

describe('volatilityPct', () => {
  it('returns stddev/mean as percentage', () => {
    const v = volatilityPct([4.0, 4.2, 3.8, 4.1]);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(10);  // small spread
  });
  it('returns 0 for constant series', () => {
    expect(volatilityPct([4, 4, 4])).toBe(0);
  });
  it('returns null for fewer than 2 points', () => {
    expect(volatilityPct([4])).toBeNull();
  });
});
