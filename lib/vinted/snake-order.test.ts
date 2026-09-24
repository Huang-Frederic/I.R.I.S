// lib/vinted/snake-order.test.ts
import { describe, it, expect } from 'vitest';
import { chunkIntoRows, toSnakeOrder, fromSnakeOrder } from './snake-order';

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
  it('puts the last row first (reading top-to-bottom) and reverses the bottom (first) row', () => {
    // Bottom row (row 0: A-E) reads right-to-left and renders last (at the
    // bottom); the row above it (F-J) reads left-to-right and renders first.
    expect(toSnakeOrder(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'], 5)).toEqual([
      'F', 'G', 'H', 'I', 'J', 'E', 'D', 'C', 'B', 'A',
    ]);
  });

  it('reverses the bottom row correctly even when it is a partial final row', () => {
    // "F, G" is the partial final chunk (row 1), so it's the row rendered
    // first/on top — unreversed. "A-E" (row 0) is the bottom, reversed.
    expect(toSnakeOrder(['A', 'B', 'C', 'D', 'E', 'F', 'G'], 5)).toEqual([
      'F', 'G', 'E', 'D', 'C', 'B', 'A',
    ]);
  });

  it('still reverses a single row (fewer items than columns) — it is always the bottom, right-to-left row', () => {
    expect(toSnakeOrder(['A', 'B', 'C'], 5)).toEqual(['C', 'B', 'A']);
  });

});

describe('fromSnakeOrder', () => {
  it('recovers the original order across two full rows (even row count)', () => {
    // Reversing row order isn't its own inverse when the row count is even —
    // this is exactly the case that broke a naive "call toSnakeOrder twice"
    // approach and is why fromSnakeOrder exists as a separate function.
    const original = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    const visual = toSnakeOrder(original, 5);
    expect(fromSnakeOrder(visual, 5)).toEqual(original);
  });

  it('recovers the original order across three full rows (odd row count)', () => {
    const original = Array.from({ length: 15 }, (_, i) => i);
    const visual = toSnakeOrder(original, 5);
    expect(fromSnakeOrder(visual, 5)).toEqual(original);
  });

  it('recovers the original order when the final (bottom) row is partial', () => {
    const original = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const visual = toSnakeOrder(original, 5);
    expect(fromSnakeOrder(visual, 5)).toEqual(original);
  });

  it('recovers the original order for a single row (fewer items than columns)', () => {
    const original = ['A', 'B', 'C'];
    const visual = toSnakeOrder(original, 5);
    expect(fromSnakeOrder(visual, 5)).toEqual(original);
  });

  it('recovers the original order across four full rows (even row count, partial-row edge case absent)', () => {
    const original = Array.from({ length: 20 }, (_, i) => i);
    const visual = toSnakeOrder(original, 5);
    expect(fromSnakeOrder(visual, 5)).toEqual(original);
  });
});
