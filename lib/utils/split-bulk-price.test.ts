import { describe, expect, it } from 'vitest';
import { splitPrice } from './split-bulk-price';

describe('splitPrice', () => {
  it('splits evenly when total divides cleanly', () => {
    expect(splitPrice(100, 4)).toEqual([25, 25, 25, 25]);
    expect(splitPrice(80, 4)).toEqual([20, 20, 20, 20]);
  });

  it('puts the remainder on the LAST item when not evenly divisible', () => {
    expect(splitPrice(100, 3)).toEqual([33.33, 33.33, 33.34]);
    expect(splitPrice(50, 3)).toEqual([16.66, 16.66, 16.68]);
  });

  it('returns zeros when total is 0', () => {
    expect(splitPrice(0, 4)).toEqual([0, 0, 0, 0]);
  });

  it('returns the total in a single-element array when n=1', () => {
    expect(splitPrice(80, 1)).toEqual([80]);
    expect(splitPrice(33.33, 1)).toEqual([33.33]);
  });

  it('throws when n=0 (caller must guard)', () => {
    expect(() => splitPrice(100, 0)).toThrow();
  });

  it('handles decimal totals via cent-rounding', () => {
    // 12.345 → 1235 cents (rounded), split by 2 → 617 base + 1 remainder → [617, 618] cents → [6.17, 6.18]
    expect(splitPrice(12.345, 2)).toEqual([6.17, 6.18]);
  });
});
