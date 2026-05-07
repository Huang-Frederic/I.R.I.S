import { describe, expect, it } from 'vitest';
import {
  aggregateCostByDay,
  buildHeatmapMatrix,
  buildRarityCounts,
  topRaresByPrice,
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
    const result = aggregateCostByDay([], anchor);
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
    const result = aggregateCostByDay(events, anchor);
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
    const result = aggregateCostByDay(events, anchor);
    expect(result.every((r) => r.gemini === 0 && r.vision === 0)).toBe(true);
  });

  it('coerces string cost_eur values from postgres numeric', () => {
    const events = [
      { created_at: '2026-05-07T08:00:00Z', engine: 'gemini' as const, cost_eur: '0.001500' },
    ];
    const result = aggregateCostByDay(events, anchor);
    const today = result.find((r) => r.day === '2026-05-07');
    expect(today?.gemini).toBeCloseTo(0.0015, 6);
  });
});
