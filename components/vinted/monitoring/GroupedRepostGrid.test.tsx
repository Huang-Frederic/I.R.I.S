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
      activeJobTarget={null}
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
  it('renders row 0 (position #1, top, next to the start slot) first, then winds down the group', () => {
    const { container } = renderGrid();
    // "Pokémon FR" has 6 items at 3 columns, but row 0 gives up one slot to
    // the start placeholder: row0 = [Mimiqui, Démolosse] (top, natural, 2
    // cards), row1 = [Lougaroc, Draeuil, Cizayox] (middle, reversed for DOM
    // order, 3 cards), row2 = [Pharamp] (bottom, the lone leftover row). Its
    // cards are the first 6 overlays in DOM order (the lot comes after) — no
    // need to filter (see the queue-grid test's note on why exact-string
    // filtering against `textContent` — which includes the price — would
    // silently never match).
    const names = cardsInDomOrder(container);
    expect(names[0]).toContain('Mimiqui V'); // row 0 starts with position #1, right by the start slot
    expect(names[1]).toContain('Démolosse V');
    expect(names[2]).toContain('Lougaroc V'); // row 1 (reversed) starts with its LAST logical item (position 5)
    expect(names[3]).toContain('Draeuil V');
    expect(names[4]).toContain('Cizayox V'); // row 1 (reversed) ends with its FIRST logical item (position 3)
    expect(names[5]).toContain('Pharamp GX'); // row 2 (bottom), the lone leftover item
  });

  it('uses a left-pointing chevron in row 0 (climbing up toward the start slot) and a right-pointing one in row 1', () => {
    const { container } = renderGrid();
    // Row 0 (not reversed, at the top, only 2 cards): 1 left-chevron between
    // its cards, plus 1 more connecting position #1 to the start slot. Row 1
    // (reversed): 2 right-chevrons between its 3 cards.
    expect(container.querySelectorAll('svg.lucide-chevron-left').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll('svg.lucide-chevron-right').length).toBeGreaterThanOrEqual(2);
  });

  it('renders an up chevron between rows within the same group', () => {
    const { container } = renderGrid();
    // "Pokémon FR" has 2 rows (6 items / 3 columns) → 1 row transition.
    expect(container.querySelectorAll('svg.lucide-chevron-up').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the bot lead-in slot before the very first card (position #1, top)', () => {
    const { container } = renderGrid();
    const startSlot = container.querySelector('svg.lucide-bot');
    expect(startSlot).toBeInTheDocument();
    const firstCardOverlay = screen.getByText('Mimiqui V').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
    const position = startSlot!.compareDocumentPosition(firstCardOverlay);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('still calls onReorder with the moved item\'s id when using "move to front"', () => {
    const onReorder = vi.fn();
    renderGrid({ onReorder });
    const overlay = screen.getByText('Démolosse V').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
    fireEvent.click(overlay.parentElement as HTMLElement);
    fireEvent.click(within(overlay).getByLabelText('Mettre en premier dans le groupe'));
    expect(onReorder).toHaveBeenCalledWith(expect.any(Array), 'c2');
  });

  it('renders a persistent green border for cards listed in pendingIds', () => {
    renderGrid({ pendingIds: new Set(['c2']) });
    const card = screen.getByText('Démolosse V').closest('[data-testid="poster-card-overlay"]')!.parentElement as HTMLElement;
    expect(card.className).toContain('border-staleness-fresh');
  });

  it('still allows a plain click to reveal the overlay — regression test for the "clicking does nothing" bug', () => {
    renderGrid();
    const overlay = screen.getByText('Mimiqui V').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
    const card = overlay.parentElement as HTMLElement;
    fireEvent.mouseDown(card, { clientX: 100, clientY: 100, button: 0 });
    fireEvent.mouseMove(document, { clientX: 101, clientY: 100 });
    fireEvent.mouseUp(document, { clientX: 101, clientY: 100 });
    fireEvent.click(card);
    const classes = overlay.className.split(/\s+/);
    expect(classes).toContain('opacity-100');
    expect(classes).not.toContain('opacity-0');
  });

  it('a quick tap reveals the overlay on touch instead of being swallowed as a drag attempt', () => {
    // No TouchSensor is registered at all (drag-and-drop is mouse-only) —
    // touch events must never be captured by dnd-kit and must always fall
    // through to a normal click, fixing the "horrible à toucher" bug.
    renderGrid();
    const overlay = screen.getByText('Mimiqui V').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
    const card = overlay.parentElement as HTMLElement;
    fireEvent.touchStart(card, { touches: [{ clientX: 100, clientY: 100, identifier: 1 }] });
    fireEvent.touchEnd(card, { touches: [] });
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

  it('dims, disables dragging, and disables the action buttons for the card the bot is actively processing', () => {
    renderGrid({ activeJobTarget: { cardId: 'c2', lotId: null } });
    const overlay = screen.getByText('Démolosse V').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
    const card = overlay.parentElement as HTMLElement;
    fireEvent.click(card);
    expect(card.className).toContain('opacity-60');
    expect(within(overlay).getByLabelText('Reposter maintenant')).toBeDisabled();
    expect(within(overlay).getByLabelText("Voir l'annonce")).not.toBeDisabled();
  });

  it('leaves every other card fully interactive when a different card is being processed', () => {
    renderGrid({ activeJobTarget: { cardId: 'some-other-card-id', lotId: null } });
    const overlay = screen.getByText('Démolosse V').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
    const card = overlay.parentElement as HTMLElement;
    fireEvent.click(card);
    expect(within(overlay).getByLabelText('Reposter maintenant')).not.toBeDisabled();
  });

  it('computeSnakeReorder converts a post-drag visual order back into the correct logical save order', () => {
    // Group 0 reserves a slot for the start placeholder: row0 = [Mimiqui,
    // Démolosse] (2 cards), row1 = [Lougaroc, Draeuil, Cizayox] (reversed for
    // DOM order), row2 = [Pharamp] (the lone leftover row); then
    // "Riftbound"'s single-item row = [Lot].
    const visualOrder: RepostPoolItem[] = [
      ITEMS[0], ITEMS[1], // row0: Mimiqui, Démolosse
      ITEMS[4], ITEMS[3], ITEMS[2], // row1 reversed: Lougaroc, Draeuil, Cizayox
      ITEMS[5], // row2: Pharamp
      ITEMS[6], // Riftbound: Lot Riftbound
    ];
    // Drag "Cizayox" (visual index 4) up to index 1 — arrayMove removes it
    // then reinserts at index 1 of the now-6-long remainder [Mimiqui,
    // Démolosse, Lougaroc, Draeuil, Pharamp, Lot] → [Mimiqui, Cizayox,
    // Démolosse, Lougaroc, Draeuil, Pharamp, Lot]. Re-chunking "Pokémon FR"
    // with the lead-in reservation: row0 = [Mimiqui, Cizayox] (unchanged),
    // row1 = [Démolosse, Lougaroc, Draeuil] (reversed → [Draeuil, Lougaroc,
    // Démolosse]), row2 = [Pharamp] (unchanged).
    const result = computeSnakeReorder(visualOrder, 4, 1, 3);
    expect(result.map((i) => i.name)).toEqual([
      'Mimiqui V', 'Cizayox V', 'Draeuil V', 'Lougaroc V', 'Démolosse V', 'Pharamp GX', 'Lot Riftbound',
    ]);
  });
});
