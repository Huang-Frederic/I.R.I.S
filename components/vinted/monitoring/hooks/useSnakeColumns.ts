'use client';

import { useEffect, useState, type RefObject } from 'react';

const SM_QUERY = '(min-width: 640px)'; // Tailwind's `sm` breakpoint
const LG_QUERY = '(min-width: 1024px)'; // Tailwind's `lg` breakpoint

// Must match PosterCard's actual rendered width at each tier exactly
// (w-31/sm:w-35/lg:w-40 in PosterCard.tsx) — these drive how many cards
// actually fit per row, not just a rough guess.
const CARD_WIDTH_BASE = 124;
const CARD_WIDTH_SM = 140;
const CARD_WIDTH_LG = 160;

// Approximate width of one CardConnector ('card' variant: a 16px h-4 w-4
// icon) plus the gap-2 (8px) on either side of it in the row's flex layout.
// Doesn't vary by breakpoint, unlike the card width above.
const CONNECTOR_SLOT_PX = 32;

const FALLBACK_COLUMNS = 3;
const MIN_COLUMNS = 1;

/**
 * How many `cardWidth`-wide slots (each preceded by a `connectorWidth`-wide
 * connector, except the first) fit inside `availableWidth`. Pure so the
 * column math is testable without a real layout engine — happy-dom doesn't
 * compute one, so `useSnakeColumns` below is the only thing that touches
 * real DOM measurement.
 */
export function computeColumnsForWidth(
  availableWidth: number,
  cardWidth: number,
  connectorWidth: number = CONNECTOR_SLOT_PX,
): number {
  if (availableWidth <= 0 || cardWidth <= 0) return MIN_COLUMNS;
  const columns = Math.floor((availableWidth + connectorWidth) / (cardWidth + connectorWidth));
  return Math.max(MIN_COLUMNS, columns);
}

/**
 * Measures `containerRef`'s actual rendered width and returns how many
 * cards fit per row at the current breakpoint's card size — replaces a
 * fixed 3-or-5 guess with the real available space, so a wide screen gets
 * as many columns as it can actually show.
 */
export function useSnakeColumns(containerRef: RefObject<HTMLElement | null>): number {
  const [columns, setColumns] = useState(FALLBACK_COLUMNS);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const smMql = window.matchMedia(SM_QUERY);
    const lgMql = window.matchMedia(LG_QUERY);

    const recompute = () => {
      const cardWidth = lgMql.matches ? CARD_WIDTH_LG : smMql.matches ? CARD_WIDTH_SM : CARD_WIDTH_BASE;
      setColumns(computeColumnsForWidth(element.clientWidth, cardWidth));
    };

    recompute();

    const resizeObserver = new ResizeObserver(recompute);
    resizeObserver.observe(element);
    smMql.addEventListener('change', recompute);
    lgMql.addEventListener('change', recompute);

    return () => {
      resizeObserver.disconnect();
      smMql.removeEventListener('change', recompute);
      lgMql.removeEventListener('change', recompute);
    };
  }, [containerRef]);

  return columns;
}
