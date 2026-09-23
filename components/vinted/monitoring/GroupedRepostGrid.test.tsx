// components/vinted/monitoring/GroupedRepostGrid.test.tsx
import type { ComponentProps } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import GroupedRepostGrid, { computeSnakeReorder, type RepostPoolItem } from './GroupedRepostGrid';

// This suite's environment is happy-dom (vitest.config.ts), whose `matchMedia`
// always reports `matches: true` regardless of the query or window width, and
// whose elements always report `clientWidth: 0` (no real layout engine).
// Stub both so `useSnakeColumns` resolves to the narrow (136px) card-width
// tier and a 500px measured container width, which computes to exactly 3
// columns (see useSnakeColumns.test.ts's `computeColumnsForWidth` case) —
// matching the fixture below, computed for 3 columns.
const originalClientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 500 });
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalClientWidthDescriptor) {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidthDescriptor);
  }
});

// 6 items in "Pokémon FR" (two full 3-column rows in tests' default column
// count) + 1 lot in "Riftbound".
const ITEMS: RepostPoolItem[] = [
  { cardId: 'c1', lotId: null, name: 'Mimiqui V', price: 2, imageUrl: 'a.png', vintedPostedAt: '2026-01-01T00:00:00Z', groupKey: 'Pokémon FR', repostPosition: 1 },
  { cardId: 'c2', lotId: null, name: 'Démolosse V', price: 4, imageUrl: 'b.png', vintedPostedAt: '2026-01-02T00:00:00Z', groupKey: 'Pokémon FR', repostPosition: 2 },
  { cardId: 'c3', lotId: null, name: 'Cizayox V', price: 4.5, imageUrl: 'c.png', vintedPostedAt: '2026-01-03T00:00:00Z', groupKey: 'Pokémon FR', repostPosition: 3 },
  { cardId: 'c4', lotId: null, name: 'Draeuil V', price: 2, imageUrl: 'd.png', vintedPostedAt: '2026-01-04T00:00:00Z', groupKey: 'Pokémon FR', repostPosition: 4 },
  { cardId: 'c5', lotId: null, name: 'Lougaroc V', price: 3, imageUrl: 'e.png', vintedPostedAt: '2026-01-05T00:00:00Z', groupKey: 'Pokémon FR', repostPosition: 5 },
  { cardId: 'c6', lotId: null, name: 'Pharamp GX', price: 9.5, imageUrl: 'f.png', vintedPostedAt: '2026-01-06T00:00:00Z', groupKey: 'Pokémon FR', repostPosition: 6 },
  { cardId: null, lotId: 'l1', name: 'Lot Riftbound', price: 12, imageUrl: 'g.png', vintedPostedAt: '2026-01-07T00:00:00Z', groupKey: 'Riftbound', repostPosition: null },
];

function renderGrid(overrides: Partial<ComponentProps<typeof GroupedRepostGrid>> = {}) {
  return render(
    <GroupedRepostGrid
      items={ITEMS}
      active={true}
      groupPriority={[]}
      editable={true}
      onReorder={vi.fn()}
      onRepostNow={vi.fn()}
      repostingId={null}
      onViewListing={vi.fn()}
      pendingIds={new Set<string>()}
      {...overrides}
    />,
  );
}

function cardsInDomOrder(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-testid="poster-card-overlay"]')).map(
    (overlay) => overlay.textContent ?? '',
  );
}

describe('<GroupedRepostGrid> snake layout', () => {
  it('renders row 0 left-to-right and row 1 right-to-left within the same group (3-column default in tests)', () => {
    const { container } = renderGrid();
    // "Pokémon FR"'s 6 cards are the first 6 overlays in DOM order (the lot
    // comes after) — no need to filter (see the queue-grid test's note on why
    // exact-string filtering against `textContent` — which includes the
    // price — would silently never match).
    const names = cardsInDomOrder(container);
    expect(names[0]).toContain('Mimiqui V'); // row 0 starts with the first logical item
    expect(names[1]).toContain('Démolosse V');
    expect(names[2]).toContain('Cizayox V');
    expect(names[3]).toContain('Pharamp GX'); // row 1 (reversed) starts with its LAST logical item (position 6)
    expect(names[4]).toContain('Lougaroc V');
    expect(names[5]).toContain('Draeuil V'); // row 1 (reversed) ends with its FIRST logical item (position 4)
  });

  it('uses a left-pointing chevron between cards in an odd (reversed) row and a right-pointing one in an even row', () => {
    const { container } = renderGrid();
    expect(container.querySelectorAll('svg.lucide-chevron-right').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll('svg.lucide-chevron-left').length).toBeGreaterThanOrEqual(2);
  });

  it('renders an up chevron between rows within the same group', () => {
    const { container } = renderGrid();
    // "Pokémon FR" has 2 rows (6 items / 3 columns) → 1 row transition.
    expect(container.querySelectorAll('svg.lucide-chevron-up').length).toBeGreaterThanOrEqual(1);
  });

  it('still calls onReorder with the moved item\'s id when using "move to front"', () => {
    const onReorder = vi.fn();
    renderGrid({ onReorder });
    const overlay = screen.getByText('Démolosse V').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
    fireEvent.click(overlay.parentElement as HTMLElement);
    fireEvent.click(within(overlay).getByLabelText('Mettre en premier dans le groupe'));
    expect(onReorder).toHaveBeenCalledWith(expect.any(Array), 'c2');
  });

  it('renders a persistent thicker red border for cards listed in pendingIds', () => {
    renderGrid({ pendingIds: new Set(['c2']) });
    const card = screen.getByText('Démolosse V').closest('[data-testid="poster-card-overlay"]')!.parentElement as HTMLElement;
    expect(card.className).toContain('border-2');
  });

  it('still allows a plain click to reveal the overlay — regression test for the "clicking does nothing" bug', () => {
    renderGrid();
    const overlay = screen.getByText('Mimiqui V').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
    const card = overlay.parentElement as HTMLElement;
    fireEvent.pointerDown(card, { pointerId: 1, clientX: 100, clientY: 100, button: 0, isPrimary: true });
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 101, clientY: 100, isPrimary: true });
    fireEvent.pointerUp(document, { pointerId: 1, clientX: 101, clientY: 100, isPrimary: true });
    fireEvent.click(card);
    const classes = overlay.className.split(/\s+/);
    expect(classes).toContain('opacity-100');
    expect(classes).not.toContain('opacity-0');
  });

  it('does not render the move/repost buttons when not editable, but still allows viewing the listing', () => {
    renderGrid({ editable: false });
    fireEvent.click(screen.getByText('Mimiqui V'));
    expect(screen.queryByLabelText('Reposter maintenant')).toBeNull();
    expect(screen.getAllByLabelText("Voir l'annonce", { selector: 'button' }).length).toBe(ITEMS.length);
  });

  it('calls onViewListing with the clicked item, including lot items', () => {
    const onViewListing = vi.fn();
    renderGrid({ onViewListing });
    const card = screen.getByText('Lot Riftbound').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
    fireEvent.click(card);
    fireEvent.click(within(card).getByLabelText("Voir l'annonce", { selector: 'button' }));
    expect(onViewListing).toHaveBeenCalledWith(ITEMS[6]);
  });

  it('computeSnakeReorder converts a post-drag visual order back into the correct logical save order', () => {
    // visualOrder (3 columns): "Pokémon FR" row0 = [c1,c2,c3], row1 reversed =
    // [c6,c5,c4]; then "Riftbound"'s single-item row = [l1].
    const visualOrder: RepostPoolItem[] = [
      ITEMS[0], ITEMS[1], ITEMS[2], // row0: Mimiqui, Démolosse, Cizayox
      ITEMS[5], ITEMS[4], ITEMS[3], // row1 reversed: Pharamp, Lougaroc, Draeuil
      ITEMS[6], // Riftbound: Lot Riftbound
    ];
    // Hand-traced: arrayMove(visualOrder, 4, 1) removes index 4 (Lougaroc)
    // then re-inserts it at index 1 of the now-6-long remainder
    // [Mimiqui, Démolosse, Cizayox, Pharamp, Draeuil, Lot] →
    // [Mimiqui, Lougaroc, Démolosse, Cizayox, Pharamp, Draeuil, Lot].
    // Re-grouping: "Pokémon FR" = [Mimiqui, Lougaroc, Démolosse, Cizayox,
    // Pharamp, Draeuil] (6 items, contiguous), "Riftbound" = [Lot].
    // Re-chunking "Pokémon FR" into rows of 3: row0 = [Mimiqui, Lougaroc,
    // Démolosse] (kept as-is), row1 = [Cizayox, Pharamp, Draeuil] (reversed
    // → [Draeuil, Pharamp, Cizayox]).
    const result = computeSnakeReorder(visualOrder, 4, 1, 3);
    expect(result.map((i) => i.name)).toEqual([
      'Mimiqui V', 'Lougaroc V', 'Démolosse V', 'Draeuil V', 'Pharamp GX', 'Cizayox V', 'Lot Riftbound',
    ]);
  });
});
