/**
 * Where to put the enlarged card that appears when a board card is hovered.
 *
 * Kept out of the component because it is the only part with a right answer:
 * the preview must never fall off screen, and the board spans the full width
 * of the page, so cards near the right edge have to flip to the other side.
 */

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * @param anchor   the hovered card, in viewport coordinates
 * @param preview  the enlarged card's size
 * @param viewport visible area
 * @param gap      space between the card and its preview
 * @param margin   smallest distance the preview may sit from an edge
 */
export function previewPosition(
  anchor: Rect,
  preview: Size,
  viewport: Size,
  gap = 14,
  margin = 8,
): { left: number; top: number } {
  const right = anchor.left + anchor.width + gap;
  const left = anchor.left - gap - preview.width;

  // Right of the card by default, flipping left when it would overflow. When
  // neither side fits — a narrow window — centre it on the card and let the
  // clamp below keep it on screen, which is better than picking a side that
  // pushes half the preview out of view.
  let x: number;
  if (right + preview.width <= viewport.width - margin) x = right;
  else if (left >= margin) x = left;
  else x = anchor.left + anchor.width / 2 - preview.width / 2;

  const y = anchor.top + anchor.height / 2 - preview.height / 2;

  return {
    left: clamp(x, margin, Math.max(margin, viewport.width - preview.width - margin)),
    // A preview taller than the window can only be pinned to the top; the
    // clamp range would otherwise be inverted and land it off screen.
    top:
      preview.height >= viewport.height - margin * 2
        ? margin
        : clamp(y, margin, viewport.height - preview.height - margin),
  };
}
