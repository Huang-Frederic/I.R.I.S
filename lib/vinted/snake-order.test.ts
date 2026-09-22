// lib/vinted/snake-order.test.ts
import { describe, it, expect } from 'vitest';
import { chunkIntoRows, toSnakeOrder } from './snake-order';

describe('chunkIntoRows', () => {
  it('splits items into equal-size chunks', () => {
    expect(chunkIntoRows([1, 2, 3, 4, 5, 6], 3)).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
  });

  it('keeps a shorter final chunk when the count is not a multiple of columns', () => {
    expect(chunkIntoRows([1, 2, 3, 4, 5], 3)).toEqual([[1, 2, 3], [4, 5]]);
  });

  it('returns an empty array for an empty input', () => {
    expect(chunkIntoRows([], 3)).toEqual([]);
  });

  it('returns one row per item when columns is 1', () => {
    expect(chunkIntoRows([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });
});

describe('toSnakeOrder', () => {
  it('keeps the first row as-is and reverses the second row', () => {
    expect(toSnakeOrder(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'], 5)).toEqual([
      'A', 'B', 'C', 'D', 'E', 'J', 'I', 'H', 'G', 'F',
    ]);
  });

  it('reverses the second row correctly even when it is a partial final row', () => {
    expect(toSnakeOrder(['A', 'B', 'C', 'D', 'E', 'F', 'G'], 5)).toEqual([
      'A', 'B', 'C', 'D', 'E', 'G', 'F',
    ]);
  });

  it('leaves a single row (fewer items than columns) unchanged', () => {
    expect(toSnakeOrder(['A', 'B', 'C'], 5)).toEqual(['A', 'B', 'C']);
  });

  it('is its own inverse — applying it twice recovers the original order', () => {
    const original = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    const visual = toSnakeOrder(original, 5);
    expect(toSnakeOrder(visual, 5)).toEqual(original);
  });

  it('is its own inverse for a partial final row too', () => {
    const original = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const visual = toSnakeOrder(original, 5);
    expect(toSnakeOrder(visual, 5)).toEqual(original);
  });

  it('is its own inverse across three full rows', () => {
    const original = Array.from({ length: 15 }, (_, i) => i);
    const visual = toSnakeOrder(original, 5);
    expect(toSnakeOrder(visual, 5)).toEqual(original);
  });
});
