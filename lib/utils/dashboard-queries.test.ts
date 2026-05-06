import { describe, expect, it } from 'vitest';
import {
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
