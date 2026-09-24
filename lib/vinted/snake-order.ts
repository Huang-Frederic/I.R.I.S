// lib/vinted/snake-order.ts

/** Splits `items` into consecutive chunks of at most `columns` items each. */
export function chunkIntoRows<T>(items: T[], columns: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns));
  }
  return rows;
}

/** Splits `items` into consecutive chunks whose sizes are given by `sizes`
 *  (which must sum to `items.length`) — used to re-chunk a reordered array
 *  along the original row boundaries, which a fixed-size `chunkIntoRows`
 *  can't do once a differently-sized (partial) row has moved to the front. */
function chunkBySizes<T>(items: T[], sizes: number[]): T[][] {
  const rows: T[][] = [];
  let offset = 0;
  for (const size of sizes) {
    rows.push(items.slice(offset, offset + size));
    offset += size;
  }
  return rows;
}

/** The row sizes `chunkIntoRows(array_of_this_length, columns)` would
 *  produce — every row is `columns` long except a possible shorter last one. */
function rowSizes(itemCount: number, columns: number): number[] {
  const sizes = Array(Math.floor(itemCount / columns)).fill(columns);
  const remainder = itemCount % columns;
  if (remainder > 0) sizes.push(remainder);
  return sizes;
}

/**
 * Converts logical (saved) order to visual (render/drag) order: reverses
 * every other row counting from row 0 (the earliest items) AND reverses the
 * row order itself, so the flattened result read top-to-bottom traces a
 * boustrophedon ("snake") path that *starts at the bottom* row — row 0
 * flows right→left, the row above it left→right, the one above that
 * right→left again, and so on winding upward.
 *
 * Not its own inverse (reversing row order breaks that trick when the row
 * count is even) — use `fromSnakeOrder` to convert back.
 */
export function toSnakeOrder<T>(items: T[], columns: number): T[] {
  return chunkIntoRows(items, columns)
    .map((row, rowIndex) => (rowIndex % 2 === 0 ? [...row].reverse() : row))
    .reverse()
    .flat();
}

/**
 * The exact inverse of `toSnakeOrder`: converts a (possibly drag-reordered)
 * visual-order array back to logical order. Re-chunks using the original
 * row-size sequence (reversed, since `toSnakeOrder` put the last — possibly
 * partial — row first) rather than a fixed-size `chunkIntoRows`, which
 * would misalign the boundaries whenever the partial row isn't full size.
 */
export function fromSnakeOrder<T>(visual: T[], columns: number): T[] {
  const sizesInVisualOrder = [...rowSizes(visual.length, columns)].reverse();
  return chunkBySizes(visual, sizesInVisualOrder)
    .reverse()
    .map((row, rowIndex) => (rowIndex % 2 === 0 ? [...row].reverse() : row))
    .flat();
}
