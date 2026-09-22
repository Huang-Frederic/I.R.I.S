import type { ComponentProps } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import GroupedQueueGrid, { computeSnakeReorder, type PipelineItem } from './GroupedQueueGrid';

// This suite's environment is happy-dom (vitest.config.ts), whose `matchMedia`
// always reports `matches: true` regardless of the query or window width —
// unlike real browsers, it never evaluates the condition. Left unmocked,
// `useSnakeColumns` would resolve to its wide (5-column) value in every test
// here. Stub it to force the narrow (3-column) value so the fixture below
// (computed for 3 columns) actually matches what renders — same pattern
// already used in `./hooks/useSnakeColumns.test.ts`.
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
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
  it('renders row 0 left-to-right and row 1 right-to-left within the same group (3-column default in tests)', () => {
    const { container } = renderGrid();
    // "Pokémon FR" has 7 items at 3 columns: row0 = [Pharamp,Fulguris,Lougaroc],
    // row1 = [Draeuil,Mimiqui,Démolosse] reversed for DOM order, row2 = [Cizayox].
    // Its cards are the first 7 overlays in DOM order (the "Magic" item comes
    // after) — no need to filter, `textContent` includes the price too so
    // exact-string filtering/array-containing would silently never match.
    const names = cardsInDomOrder(container);
    expect(names[0]).toContain('Pharamp GX'); // row 0 starts with the first logical item
    expect(names[1]).toContain('Fulguris GX');
    expect(names[2]).toContain('Lougaroc V');
    expect(names[3]).toContain('Démolosse V'); // row 1 (reversed) starts with its LAST logical item
    expect(names[4]).toContain('Mimiqui V');
    expect(names[5]).toContain('Draeuil V'); // row 1 (reversed) ends with its FIRST logical item
    expect(names[6]).toContain('Cizayox V'); // row 2, a single leftover item
  });

  it('uses a left-pointing chevron between cards in an odd (reversed) row and a right-pointing one in an even row', () => {
    const { container } = renderGrid();
    // Row 0 (even): 2 right-chevrons between its 3 cards. Row 1 (even index
    // 1 is odd/reversed): 2 left-chevrons between its 3 cards.
    expect(container.querySelectorAll('svg.lucide-chevron-right').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll('svg.lucide-chevron-left').length).toBeGreaterThanOrEqual(2);
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

  it('renders a persistent green dashed border for cards listed in pendingIds', () => {
    renderGrid({ pendingIds: new Set(['q2']) });
    const card = screen.getByText('Fulguris GX').closest('[data-testid="poster-card-overlay"]')!.parentElement as HTMLElement;
    expect(card.className).toContain('border-staleness-fresh');
  });

  it('renders the PC lead-in slot before the very first card', () => {
    const { container } = renderGrid();
    const monitorIcon = container.querySelector('svg.lucide-monitor');
    expect(monitorIcon).toBeInTheDocument();
    const firstCardOverlay = screen.getByText('Pharamp GX').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
    const position = monitorIcon!.compareDocumentPosition(firstCardOverlay);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('still allows a plain click to reveal the overlay — regression test for the "clicking does nothing" bug', () => {
    renderGrid();
    const overlay = screen.getByText('Pharamp GX').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
    const card = overlay.parentElement as HTMLElement;
    fireEvent.pointerDown(card, { pointerId: 1, clientX: 100, clientY: 100, button: 0, isPrimary: true });
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 101, clientY: 100, isPrimary: true });
    fireEvent.pointerUp(document, { pointerId: 1, clientX: 101, clientY: 100, isPrimary: true });
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

  it('computeSnakeReorder converts a post-drag visual order back into the correct logical save order', () => {
    const visualOrder: PipelineItem[] = [
      ITEMS[0], ITEMS[1], ITEMS[2], // row0: Pharamp, Fulguris, Lougaroc
      ITEMS[5], ITEMS[4], ITEMS[3], // row1 reversed: Démolosse, Mimiqui, Draeuil
      ITEMS[6], // row2: Cizayox
      ITEMS[7], // Magic: Zeraora
    ];
    const result = computeSnakeReorder(visualOrder, 4, 2, 3);
    expect(result.map((i) => i.name)).toEqual([
      'Pharamp GX', 'Fulguris GX', 'Mimiqui V', 'Draeuil V', 'Démolosse V', 'Lougaroc V', 'Cizayox V', 'Zeraora VSTAR',
    ]);
  });
});
