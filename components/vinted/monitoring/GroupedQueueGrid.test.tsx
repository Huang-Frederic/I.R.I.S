import type { ComponentProps } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import GroupedQueueGrid, { computeSnakeReorder, type PipelineItem } from './GroupedQueueGrid';

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

// 7 items in "Pokémon FR" (spans two rows at the test's 3-column default —
// `matchMedia` is stubbed above to force `useSnakeColumns` to its narrow,
// 3-column value) + 1 in "Magic".
const ITEMS: PipelineItem[] = [
  { queueId: 'q1', cardId: 'c1', lotId: null, position: 1, name: 'Pharamp GX', price: 9.5, imageUrl: 'a.png', groupKey: 'Pokémon FR' },
  { queueId: 'q2', cardId: 'c2', lotId: null, position: 2, name: 'Fulguris GX', price: 5, imageUrl: 'b.png', groupKey: 'Pokémon FR' },
  { queueId: 'q3', cardId: 'c3', lotId: null, position: 3, name: 'Lougaroc V', price: 3, imageUrl: 'c.png', groupKey: 'Pokémon FR' },
  { queueId: 'q4', cardId: 'c4', lotId: null, position: 4, name: 'Draeuil V', price: 2, imageUrl: 'd.png', groupKey: 'Pokémon FR' },
  { queueId: 'q5', cardId: 'c5', lotId: null, position: 5, name: 'Mimiqui V', price: 2, imageUrl: 'e.png', groupKey: 'Pokémon FR' },
  { queueId: 'q6', cardId: 'c6', lotId: null, position: 6, name: 'Démolosse V', price: 4, imageUrl: 'f.png', groupKey: 'Pokémon FR' },
  { queueId: 'q7', cardId: 'c7', lotId: null, position: 7, name: 'Cizayox V', price: 4.5, imageUrl: 'g.png', groupKey: 'Pokémon FR' },
  { queueId: 'q8', cardId: 'c8', lotId: null, position: 8, name: 'Zeraora VSTAR', price: 7.2, imageUrl: 'h.png', groupKey: 'Magic' },
];

function renderGrid(overrides: Partial<ComponentProps<typeof GroupedQueueGrid>> = {}) {
  return render(
    <GroupedQueueGrid
      items={ITEMS}
      dailyQuota={8}
      groupPriority={[]}
      editable={true}
      onReorder={vi.fn()}
      onPostNow={vi.fn()}
      postingQueueId={null}
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

describe('<GroupedQueueGrid> snake layout', () => {
  it('renders the top (leftover) row first, then winds down to the bottom row (row 0, earliest items), reversed', () => {
    const { container } = renderGrid();
    // "Pokémon FR" has 7 items at 3 columns: row0 = [Pharamp,Fulguris,Lougaroc]
    // (bottom, reversed for DOM order), row1 = [Draeuil,Mimiqui,Démolosse]
    // (middle, natural order), row2 = [Cizayox] (top, the lone leftover row).
    // Rendering order is top-to-bottom on screen, i.e. row2, row1, row0.
    // Its cards are the first 7 overlays in DOM order (the "Magic" item comes
    // after) — no need to filter, `textContent` includes the price too so
    // exact-string filtering/array-containing would silently never match.
    const names = cardsInDomOrder(container);
    expect(names[0]).toContain('Cizayox V'); // top: the lone leftover row (row 2)
    expect(names[1]).toContain('Draeuil V'); // middle row (row 1), left-to-right
    expect(names[2]).toContain('Mimiqui V');
    expect(names[3]).toContain('Démolosse V');
    expect(names[4]).toContain('Lougaroc V'); // bottom row (row 0) starts with its LAST logical item
    expect(names[5]).toContain('Fulguris GX');
    expect(names[6]).toContain('Pharamp GX'); // bottom row ends with position #1, right by the start slot
  });

  it('uses a left-pointing chevron in the bottom (row 0) reversed row and a right-pointing one in the row above it', () => {
    const { container } = renderGrid();
    // Row 0 (bottom, reversed): 2 left-chevrons between its 3 cards, plus 1
    // more connecting it to the start slot. Row 1 (above it, not reversed):
    // 2 right-chevrons between its 3 cards.
    expect(container.querySelectorAll('svg.lucide-chevron-left').length).toBeGreaterThanOrEqual(3);
    expect(container.querySelectorAll('svg.lucide-chevron-right').length).toBeGreaterThanOrEqual(2);
  });

  it('renders an up chevron between rows within the same group', () => {
    const { container } = renderGrid();
    // "Pokémon FR" has 3 rows (7 items / 3 columns) → 2 row transitions.
    expect(container.querySelectorAll('svg.lucide-chevron-up').length).toBeGreaterThanOrEqual(2);
  });

  it('still calls onReorder with the moved item\'s id when using "move to front"', () => {
    const onReorder = vi.fn();
    renderGrid({ onReorder });
    const overlay = screen.getByText('Fulguris GX').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
    fireEvent.click(overlay.parentElement as HTMLElement);
    fireEvent.click(within(overlay).getByLabelText('Mettre en premier dans le groupe'));
    expect(onReorder).toHaveBeenCalledWith(expect.any(Array), 'q2');
  });

  it('renders a persistent green border for cards listed in pendingIds', () => {
    renderGrid({ pendingIds: new Set(['q2']) });
    const card = screen.getByText('Fulguris GX').closest('[data-testid="poster-card-overlay"]')!.parentElement as HTMLElement;
    expect(card.className).toContain('border-staleness-fresh');
  });

  it('renders the bot lead-in slot after the very last (bottom-most, position #1) card, connected by a chevron', () => {
    const { container } = renderGrid();
    const startSlot = container.querySelector('svg.lucide-bot');
    expect(startSlot).toBeInTheDocument();
    // The start slot sits at the true start of the snake — right after
    // position #1 (Pharamp GX), which is the LAST card in DOM order since
    // the bottom row (row 0) renders right-to-left.
    const firstCardOverlay = screen.getByText('Pharamp GX').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
    const position = firstCardOverlay.compareDocumentPosition(startSlot!);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('still allows a plain click to reveal the overlay — regression test for the "clicking does nothing" bug', () => {
    renderGrid();
    const overlay = screen.getByText('Pharamp GX').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
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
    const overlay = screen.getByText('Pharamp GX').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
    const card = overlay.parentElement as HTMLElement;
    fireEvent.touchStart(card, { touches: [{ clientX: 100, clientY: 100, identifier: 1 }] });
    fireEvent.touchEnd(card, { touches: [] });
    fireEvent.click(card);
    const classes = overlay.className.split(/\s+/);
    expect(classes).toContain('opacity-100');
    expect(classes).not.toContain('opacity-0');
  });

  it('does not render the move/post buttons when not editable, but still allows viewing the listing', () => {
    renderGrid({ editable: false });
    fireEvent.click(screen.getByText('Pharamp GX'));
    expect(screen.queryByLabelText('Poster maintenant')).toBeNull();
    expect(screen.getAllByLabelText("Voir l'annonce", { selector: 'button' }).length).toBe(ITEMS.length);
  });

  it('calls onViewListing with the clicked item', () => {
    const onViewListing = vi.fn();
    renderGrid({ onViewListing });
    const card = screen.getByText('Zeraora VSTAR').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
    fireEvent.click(card);
    fireEvent.click(within(card).getByLabelText("Voir l'annonce", { selector: 'button' }));
    expect(onViewListing).toHaveBeenCalledWith(ITEMS[7]);
  });

  it('dims, disables dragging, and disables the action buttons for the card the bot is actively processing', () => {
    renderGrid({ activeJobTarget: { cardId: 'c2', lotId: null } });
    const overlay = screen.getByText('Fulguris GX').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
    const card = overlay.parentElement as HTMLElement;
    fireEvent.click(card);
    expect(card.className).toContain('opacity-60');
    expect(within(overlay).getByLabelText('Poster maintenant')).toBeDisabled();
    expect(within(overlay).getByLabelText('Mettre en premier dans le groupe')).toBeDisabled();
    expect(within(overlay).getByLabelText("Voir l'annonce")).not.toBeDisabled();
  });

  it('leaves every other card fully interactive when a different card is being processed', () => {
    renderGrid({ activeJobTarget: { cardId: 'some-other-card-id', lotId: null } });
    const overlay = screen.getByText('Fulguris GX').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
    const card = overlay.parentElement as HTMLElement;
    fireEvent.click(card);
    expect(within(overlay).getByLabelText('Poster maintenant')).not.toBeDisabled();
  });

  it('computeSnakeReorder converts a post-drag visual order back into the correct logical save order', () => {
    // Actual on-screen order (top-to-bottom): row2 (top, leftover) = [Cizayox],
    // row1 = [Draeuil, Mimiqui, Démolosse] (natural order), row0 (bottom,
    // reversed) = [Lougaroc, Fulguris, Pharamp], then the "Magic" group.
    const visualOrder: PipelineItem[] = [
      ITEMS[6], // row2 (top): Cizayox
      ITEMS[3], ITEMS[4], ITEMS[5], // row1: Draeuil, Mimiqui, Démolosse
      ITEMS[2], ITEMS[1], ITEMS[0], // row0 (bottom, reversed): Lougaroc, Fulguris, Pharamp
      ITEMS[7], // Magic: Zeraora
    ];
    // Drag "Draeuil" (visual index 1) down to just after "Lougaroc" (visual
    // index 4) — arrayMove(visualOrder, 1, 4) removes Draeuil then reinserts
    // it at index 4 of the now-7-long remainder, landing it right before
    // Fulguris: [Cizayox, Mimiqui, Démolosse, Lougaroc, Draeuil, Fulguris,
    // Pharamp, Zeraora]. Re-chunking "Pokémon FR" (7 items) into rows of 3
    // from the bottom up: row0 (bottom) = [Pharamp, Fulguris, Draeuil]
    // (un-reversed back to [Draeuil, Fulguris, Pharamp] read bottom-up —
    // logical order lists it starting from Draeuil), row1 = [Mimiqui,
    // Démolosse, Lougaroc], row2 (top) = [Cizayox].
    const result = computeSnakeReorder(visualOrder, 1, 4, 3);
    expect(result.map((i) => i.name)).toEqual([
      'Pharamp GX', 'Fulguris GX', 'Draeuil V', 'Mimiqui V', 'Démolosse V', 'Lougaroc V', 'Cizayox V', 'Zeraora VSTAR',
    ]);
  });
});
