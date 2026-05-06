// lib/utils/stock-value.test.ts
import { describe, expect, it } from 'vitest';
import { computeStockValue } from './stock-value';

const baseCard = {
  status: 'for_sale' as const,
  cm_price_avg: null,
  cm_price_trend: null,
  cm_price_low: null,
};

describe('computeStockValue', () => {
  it('returns zeros when no cards', () => {
    expect(computeStockValue([])).toEqual({
      value_for_sale: 0,
      value_collection: 0,
      count_for_sale: 0,
      count_collection: 0,
    });
  });

  it('prefers cm_price_avg, falls back to trend, then low', () => {
    const result = computeStockValue([
      { ...baseCard, cm_price_avg: 10 },
      { ...baseCard, cm_price_avg: null, cm_price_trend: 5 },
      { ...baseCard, cm_price_avg: null, cm_price_trend: null, cm_price_low: 2 },
      { ...baseCard, cm_price_avg: null, cm_price_trend: null, cm_price_low: null },
    ]);
    expect(result.value_for_sale).toBe(17);
    expect(result.count_for_sale).toBe(4);
  });

  it('separates for_sale and collection buckets', () => {
    const result = computeStockValue([
      { ...baseCard, cm_price_avg: 10, status: 'for_sale' },
      { ...baseCard, cm_price_avg: 20, status: 'collection' },
      { ...baseCard, cm_price_avg: 30, status: 'collection' },
    ]);
    expect(result.value_for_sale).toBe(10);
    expect(result.count_for_sale).toBe(1);
    expect(result.value_collection).toBe(50);
    expect(result.count_collection).toBe(2);
  });

  it('ignores sold and pokedex cards', () => {
    const result = computeStockValue([
      { ...baseCard, cm_price_avg: 100, status: 'sold' },
      { ...baseCard, cm_price_avg: 200, status: 'pokedex' },
    ]);
    expect(result.value_for_sale).toBe(0);
    expect(result.count_for_sale).toBe(0);
    expect(result.value_collection).toBe(0);
    expect(result.count_collection).toBe(0);
  });
});
