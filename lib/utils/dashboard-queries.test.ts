import { describe, expect, it } from 'vitest';
import {
  aggregateCostByDay,
  buildHeatmapMatrix,
  buildRarityCounts,
  topRaresByPrice,
  parsePeriod,
  periodDays,
  computeSparkline,
} from './dashboard-queries';

describe('buildRarityCounts', () => {
  it('counts cards per rarity', () => {
    const result = buildRarityCounts([
      { rarity: 'SAR' }, { rarity: 'SAR' }, { rarity: 'AR' }, { rarity: 'C' },
    ]);
    expect(result).toEqual([
      { rarity: 'SAR', count: 2 },
      { rarity: 'AR', count: 1 },
      { rarity: 'C', count: 1 },
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(buildRarityCounts([])).toEqual([]);
  });
});

describe('topRaresByPrice', () => {
  it('returns N highest-priced cards descending', () => {
    const cards = [
      { id: 'a', cm_price_avg: 50, cm_price_trend: null, cm_price_low: null },
      { id: 'b', cm_price_avg: 100, cm_price_trend: null, cm_price_low: null },
      { id: 'c', cm_price_avg: null, cm_price_trend: 25, cm_price_low: null },
    ];
    const result = topRaresByPrice(cards, 2);
    expect(result.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('falls back to trend then low', () => {
    const cards = [
      { id: 'a', cm_price_avg: null, cm_price_trend: null, cm_price_low: 5 },
      { id: 'b', cm_price_avg: null, cm_price_trend: 10, cm_price_low: null },
    ];
    const result = topRaresByPrice(cards, 2);
    expect(result.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('skips cards with no price at all', () => {
    const cards = [
      { id: 'a', cm_price_avg: null, cm_price_trend: null, cm_price_low: null },
      { id: 'b', cm_price_avg: 10, cm_price_trend: null, cm_price_low: null },
    ];
    const result = topRaresByPrice(cards, 5);
    expect(result.map((c) => c.id)).toEqual(['b']);
  });
});

describe('buildHeatmapMatrix', () => {
  it('produces a 52x7 matrix with counts at the right cells', () => {
    // Anchor on a known Monday so test is deterministic.
    const anchor = new Date('2026-05-04T12:00:00Z'); // Monday
    const events = [
      { created_at: anchor.toISOString() }, // 0 weeks ago, day 0
      { created_at: anchor.toISOString() }, // same cell → count 2
      { created_at: '2026-04-27T12:00:00Z' }, // 1 week ago, day 0
    ];
    const matrix = buildHeatmapMatrix(events, anchor);
    expect(matrix.length).toBe(52);
    expect(matrix[0].length).toBe(7);
    expect(matrix[0][0]).toBe(2);
    expect(matrix[1][0]).toBe(1);
  });

  it('returns all-zero matrix for no events', () => {
    const matrix = buildHeatmapMatrix([], new Date('2026-05-04T12:00:00Z'));
    expect(matrix.length).toBe(52);
    expect(matrix.every((row) => row.every((c) => c === 0))).toBe(true);
  });
});

describe('aggregateCostByDay', () => {
  const anchor = new Date('2026-05-07T12:00:00Z');

  it('produces 30 daily buckets ending at anchor day, all zero when no events', () => {
    const result = aggregateCostByDay([], anchor, 30);
    expect(result.length).toBe(30);
    expect(result[result.length - 1].day).toBe('2026-05-07');
    expect(result[0].day).toBe('2026-04-08'); // 29 days before anchor
    expect(result.every((r) => r.gemini === 0 && r.vision === 0)).toBe(true);
  });

  it('sums cost per engine per day for events within window', () => {
    const events = [
      { created_at: '2026-05-07T08:00:00Z', engine: 'gemini' as const, cost_eur: 0.001 },
      { created_at: '2026-05-07T09:00:00Z', engine: 'gemini' as const, cost_eur: 0.002 },
      { created_at: '2026-05-07T10:00:00Z', engine: 'vision' as const, cost_eur: 0.0014 },
      { created_at: '2026-05-06T20:00:00Z', engine: 'gemini' as const, cost_eur: 0.003 },
    ];
    const result = aggregateCostByDay(events, anchor, 30);
    const today = result.find((r) => r.day === '2026-05-07');
    const yesterday = result.find((r) => r.day === '2026-05-06');
    expect(today?.gemini).toBeCloseTo(0.003, 6);
    expect(today?.vision).toBeCloseTo(0.0014, 6);
    expect(yesterday?.gemini).toBeCloseTo(0.003, 6);
  });

  it('ignores events outside the 30-day window', () => {
    const events = [
      { created_at: '2026-01-01T00:00:00Z', engine: 'gemini' as const, cost_eur: 999 },
    ];
    const result = aggregateCostByDay(events, anchor, 30);
    expect(result.every((r) => r.gemini === 0 && r.vision === 0)).toBe(true);
  });

  it('coerces string cost_eur values from postgres numeric', () => {
    const events = [
      { created_at: '2026-05-07T08:00:00Z', engine: 'gemini' as const, cost_eur: '0.001500' },
    ];
    const result = aggregateCostByDay(events, anchor, 30);
    const today = result.find((r) => r.day === '2026-05-07');
    expect(today?.gemini).toBeCloseTo(0.0015, 6);
  });

  it('accepts different days parameter', () => {
    const result = aggregateCostByDay([], anchor, 7);
    expect(result.length).toBe(7);
    expect(result[result.length - 1].day).toBe('2026-05-07');
    expect(result[0].day).toBe('2026-05-01'); // 6 days before anchor
  });
});

describe('parsePeriod', () => {
  it('returns 30d as default for undefined', () => {
    expect(parsePeriod(undefined)).toBe('30d');
  });

  it('returns 30d as default for non-string input', () => {
    expect(parsePeriod(['foo'])).toBe('30d');
  });

  it('accepts valid period strings', () => {
    expect(parsePeriod('7d')).toBe('7d');
    expect(parsePeriod('30d')).toBe('30d');
    expect(parsePeriod('90d')).toBe('90d');
    expect(parsePeriod('365d')).toBe('365d');
  });

  it('returns 30d for invalid period strings', () => {
    expect(parsePeriod('foo')).toBe('30d');
    expect(parsePeriod('14d')).toBe('30d');
  });
});

describe('periodDays', () => {
  it('converts period codes to day counts', () => {
    expect(periodDays('7d')).toBe(7);
    expect(periodDays('30d')).toBe(30);
    expect(periodDays('90d')).toBe(90);
    expect(periodDays('365d')).toBe(365);
  });
});

describe('computeSparkline', () => {
  const anchor = new Date('2026-05-07T12:00:00Z');

  it('returns empty series and zero totals for no events', () => {
    const result = computeSparkline([], anchor, 30, 'count');
    expect(result.series).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(result.total).toBe(0);
    expect(result.previousTotal).toBe(0);
    expect(result.delta).toBeNull();
  });

  it('counts events in the current period', () => {
    const events = [
      { created_at: '2026-05-07T08:00:00Z' }, // today
      { created_at: '2026-05-07T09:00:00Z' }, // today
      { created_at: '2026-05-01T12:00:00Z' }, // 6 days ago
    ];
    const result = computeSparkline(events, anchor, 7, 'count');
    expect(result.total).toBe(3);
    expect(result.series.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('sums cost when metric is cost', () => {
    const events = [
      { created_at: '2026-05-07T08:00:00Z', cost_eur: 0.001 },
      { created_at: '2026-05-07T09:00:00Z', cost_eur: 0.002 },
    ];
    const result = computeSparkline(events, anchor, 7, 'cost');
    expect(result.total).toBeCloseTo(0.003, 6);
  });

  it('computes delta correctly with non-zero previous period', () => {
    const events = [
      // Current period: 3 events
      { created_at: '2026-05-07T08:00:00Z' },
      { created_at: '2026-05-06T08:00:00Z' },
      { created_at: '2026-05-05T08:00:00Z' },
      // Previous period: 2 events (7-14 days ago)
      { created_at: '2026-04-30T08:00:00Z' }, // 7 days ago
      { created_at: '2026-04-29T08:00:00Z' }, // 8 days ago
    ];
    const result = computeSparkline(events, anchor, 7, 'count');
    expect(result.total).toBe(3);
    expect(result.previousTotal).toBe(2);
    expect(result.delta).toBeCloseTo(50, 1); // (3-2)/2 * 100 = 50%
  });

  it('returns null delta when previous period is zero', () => {
    const events = [
      { created_at: '2026-05-07T08:00:00Z' },
    ];
    const result = computeSparkline(events, anchor, 7, 'count');
    expect(result.total).toBe(1);
    expect(result.previousTotal).toBe(0);
    expect(result.delta).toBeNull();
  });

  it('handles negative delta correctly', () => {
    const events = [
      // Current period: 1 event
      { created_at: '2026-05-07T08:00:00Z' },
      // Previous period: 2 events
      { created_at: '2026-04-30T08:00:00Z' },
      { created_at: '2026-04-29T08:00:00Z' },
    ];
    const result = computeSparkline(events, anchor, 7, 'count');
    expect(result.total).toBe(1);
    expect(result.previousTotal).toBe(2);
    expect(result.delta).toBeCloseTo(-50, 1); // (1-2)/2 * 100 = -50%
  });

  it('ignores events outside both periods', () => {
    const events = [
      { created_at: '2026-01-01T00:00:00Z' }, // way in the past
      { created_at: '2026-05-07T08:00:00Z' }, // today
    ];
    const result = computeSparkline(events, anchor, 7, 'count');
    expect(result.total).toBe(1);
    expect(result.previousTotal).toBe(0);
  });

  it('produces 7 buckets regardless of period length', () => {
    const result30d = computeSparkline([], anchor, 30, 'count');
    const result365d = computeSparkline([], anchor, 365, 'count');
    expect(result30d.series.length).toBe(7);
    expect(result365d.series.length).toBe(7);
  });
});
