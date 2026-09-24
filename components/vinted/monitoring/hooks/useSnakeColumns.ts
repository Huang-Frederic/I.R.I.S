'use client';

import { useEffect, useState } from 'react';

const SM_QUERY = '(min-width: 640px)'; // Tailwind's `sm` breakpoint
const LG_QUERY = '(min-width: 1024px)'; // Tailwind's `lg` breakpoint

// Must match PosterCard's actual rendered width at each tier exactly
// (w-34/sm:w-38/lg:w-43 in PosterCard.tsx) — these drive how many cards
// actually fit per row, not just a rough guess.
const CARD_WIDTH_BASE = 136;
const CARD_WIDTH_SM = 152;
const CARD_WIDTH_LG = 172;

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
 * Measures `container`'s actual rendered width and returns how many cards
 * fit per row at the current breakpoint's card size — replaces a fixed
 * 3-or-5 guess with the real available space, so a wide screen gets as many
 * columns as it can actually show.
 *
 * Takes the DOM node itself (typically from a `useState`-backed callback
 * ref, e.g. `const [container, setContainer] = useState<HTMLDivElement |
 * null>(null)`), NOT a `useRef` object. A `useRef` object is a stable
 * reference that never changes identity, so an effect depending on it only
 * ever runs once — if the caller's list is empty on first paint (e.g. still
 * loading async data) and the container div doesn't exist yet, that single
 * run finds nothing to measure and gives up permanently: `columns` stays
 * frozen at the fallback forever, even once real data arrives and the div
 * mounts. Depending on the container VALUE instead means this effect
 * re-runs the moment the div actually appears (or reappears).
 */
/**
 * The vertical scrollbar's current width (0 if there's no scrollbar, or the
 * OS/browser renders an overlay one that doesn't reserve layout space).
 * Measured live, not hardcoded — Windows/Linux Chrome, Firefox, and macOS
 * all disagree on how many px a reserved-space scrollbar takes.
 */
function scrollbarWidth(): number {
  return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
}

export function useSnakeColumns(container: HTMLElement | null): number {
  const [columns, setColumns] = useState(FALLBACK_COLUMNS);

  useEffect(() => {
    if (!container) return;

    const smMql = window.matchMedia(SM_QUERY);
    const lgMql = window.matchMedia(LG_QUERY);

    const recompute = () => {
      const cardWidth = lgMql.matches ? CARD_WIDTH_LG : smMql.matches ? CARD_WIDTH_SM : CARD_WIDTH_BASE;
      // Add back whatever width the scrollbar is currently reserving — a
      // modal that locks body scroll (removing the scrollbar) was freeing
      // just enough width to fit one more column, making the grid visibly
      // resize itself open/closed. Counting that space as available all the
      // time keeps the wider layout permanent instead of tied to modal state.
      setColumns(computeColumnsForWidth(container.clientWidth + scrollbarWidth(), cardWidth));
    };

    recompute();

    const resizeObserver = new ResizeObserver(recompute);
    resizeObserver.observe(container);
    smMql.addEventListener('change', recompute);
    lgMql.addEventListener('change', recompute);

    return () => {
      resizeObserver.disconnect();
      smMql.removeEventListener('change', recompute);
      lgMql.removeEventListener('change', recompute);
    };
  }, [container]);

  return columns;
}
