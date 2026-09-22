// components/vinted/monitoring/hooks/useSnakeColumns.ts
'use client';

import { useEffect, useState } from 'react';

const BREAKPOINT_QUERY = '(min-width: 640px)'; // Tailwind's `sm` breakpoint
const NARROW_COLUMNS = 3;
const WIDE_COLUMNS = 5;

/**
 * How many cards fit per row in the snake layout, tracked live so the
 * initial render (`NARROW_COLUMNS`, matching mobile) upgrades to
 * `WIDE_COLUMNS` once the browser confirms a wider viewport — this must
 * stay in sync with the actual rendered card width, since both the visual
 * row-chunking and the drag-reorder math depend on knowing the real column
 * count.
 */
export function useSnakeColumns(): number {
  const [columns, setColumns] = useState(NARROW_COLUMNS);

  useEffect(() => {
    const mql = window.matchMedia(BREAKPOINT_QUERY);
    const update = () => setColumns(mql.matches ? WIDE_COLUMNS : NARROW_COLUMNS);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  return columns;
}
