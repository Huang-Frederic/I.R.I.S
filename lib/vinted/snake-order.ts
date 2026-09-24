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
 * ("snake") path — row 0 (the earliest items) flows left→right, row 1
 * right→left, row 2 left→right again, and so on. Row 0 renders at the top;
 * the rendering layer draws its connector arrows in the opposite direction
 * of this reading order, since the queue is presented as climbing *up* from
 * the bottom to arrive at row 0's first item (and the bot placeholder next
 * to it) — but the underlying row/item positions this function computes
 * are unaffected by that framing.
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

/** Same as `chunkIntoRows`, but the first row has one fewer slot — reserved
 *  for a lead-in element (the bot placeholder) rendered alongside it, so the
 *  first row's total visual width still matches every other row instead of
 *  running one card wider. */
export function chunkIntoRowsWithLeadIn<T>(items: T[], columns: number): T[][] {
  if (columns <= 1) return chunkIntoRows(items, columns);
  const firstRow = items.slice(0, columns - 1);
  const rest = chunkIntoRows(items.slice(columns - 1), columns);
  return firstRow.length > 0 ? [firstRow, ...rest] : rest;
}

/**
 * `toSnakeOrder`'s counterpart for the group that has the lead-in bot
 * placeholder — uses `chunkIntoRowsWithLeadIn`'s row boundaries instead of
 * `chunkIntoRows`'s. Row sizes are a deterministic function of the array's
 * own length and `columns`, so re-chunking a reordered array reproduces the
 * exact same boundaries: this stays its own inverse for the same reason
 * `toSnakeOrder` is.
 */
export function toSnakeOrderWithLeadIn<T>(items: T[], columns: number): T[] {
  return chunkIntoRowsWithLeadIn(items, columns).flatMap((row, rowIndex) =>
    rowIndex % 2 === 1 ? [...row].reverse() : row,
  );
}
