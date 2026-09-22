// lib/vinted/snake-order.ts

/** Splits `items` into consecutive chunks of at most `columns` items each. */
export function chunkIntoRows<T>(items: T[], columns: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns));
  }
  return rows;
}

/**
 * Reverses every other row (the 2nd, 4th, ...) so that reading the
 * flattened result left-to-right, row by row, traces a boustrophedon
 * ("snake") path — row 0 flows left→right, row 1 right→left, row 2
 * left→right again, and so on.
 *
 * This function is its own inverse: applying it twice with the same
 * `columns` and the same total item count reproduces the original order.
 * That's what lets one helper serve both directions of a drag — convert
 * the logical (saved) order to visual (render/drag) order before a drag,
 * then convert the post-drag visual order straight back to logical order
 * with the exact same call, no separate "unswap" function needed.
 */
export function toSnakeOrder<T>(items: T[], columns: number): T[] {
  return chunkIntoRows(items, columns).flatMap((row, rowIndex) =>
    rowIndex % 2 === 1 ? [...row].reverse() : row,
  );
}
