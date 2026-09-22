import type { ComponentProps } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import GroupedQueueGrid, { type PipelineItem } from './GroupedQueueGrid';

const ITEMS: PipelineItem[] = [
  { queueId: 'q1', cardId: 'c1', lotId: null, position: 1, name: 'Pharamp GX', price: 9.5, imageUrl: 'a.png', groupKey: 'Pokémon FR' },
  { queueId: 'q2', cardId: 'c2', lotId: null, position: 2, name: 'Fulguris GX', price: 5, imageUrl: 'b.png', groupKey: 'Pokémon FR' },
  { queueId: 'q3', cardId: 'c3', lotId: null, position: 3, name: 'Zeraora VSTAR', price: 7.2, imageUrl: 'c.png', groupKey: 'Magic' },
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

describe('<GroupedQueueGrid>', () => {
  it('renders one connector between the two cards inside the same group', () => {
    renderGrid();
    const fr = screen.getByText('Pokémon FR').closest('div') as HTMLElement;
    expect(fr.querySelectorAll('svg.lucide-chevron-right')).toHaveLength(1);
  });

  it('renders a connector between the two group frames', () => {
    const { container } = renderGrid();
    // 1 inside "Pokémon FR" (between its 2 cards) + 1 between the two groups = 2.
    expect(container.querySelectorAll('svg.lucide-chevron-right')).toHaveLength(2);
  });

  it('calls onViewListing with the clicked item', () => {
    const onViewListing = vi.fn();
    renderGrid({ onViewListing });
    // Every card renders its own "Voir l'annonce" button, so scope the query
    // to the clicked card's overlay instead of screen.getByLabelText (which
    // would be ambiguous across all 3 cards).
    const card = screen.getByText('Zeraora VSTAR').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
    fireEvent.click(card);
    fireEvent.click(within(card).getByLabelText("Voir l'annonce", { selector: 'button' }));
    expect(onViewListing).toHaveBeenCalledWith(ITEMS[2]);
  });

  it('does not render the move/post buttons when not editable, but still allows viewing the listing', () => {
    renderGrid({ editable: false });
    fireEvent.click(screen.getByText('Pharamp GX'));
    expect(screen.queryByLabelText('Poster maintenant')).toBeNull();
    expect(screen.getAllByLabelText("Voir l'annonce", { selector: 'button' }).length).toBe(ITEMS.length);
  });

  it('renders the PC lead-in slot before the very first card', () => {
    const { container } = renderGrid();
    const monitorIcon = container.querySelector('svg.lucide-monitor');
    expect(monitorIcon).toBeInTheDocument();
    const firstCardOverlay = screen.getByText('Pharamp GX').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
    // DOCUMENT_POSITION_FOLLOWING means firstCardOverlay comes AFTER monitorIcon
    // in DOM order — i.e. the slot really is a lead-in, not just present somewhere.
    const position = monitorIcon!.compareDocumentPosition(firstCardOverlay);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('still allows a plain click to reveal the overlay — regression test for the "clicking does nothing" bug (dnd-kit swallowing the click when no activationConstraint is set)', () => {
    renderGrid();
    const overlay = screen.getByText('Pharamp GX').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
    const card = overlay.parentElement as HTMLElement;
    // Simulate a real physical click: pointerdown, a sub-pixel jitter (present
    // on virtually every real click), pointerup, then the click event the
    // browser fires afterwards. Before the activationConstraint fix, dnd-kit's
    // PointerSensor treats ANY movement as a drag-start and installs a
    // capturing document-level click-canceller (see core.esm.js:1505-1506 in
    // node_modules/@dnd-kit/core) — this test reproduces exactly that
    // sequence. If it doesn't fail before Step 3's fix (or doesn't pass after
    // it), the pointer-event simulation isn't reaching dnd-kit's sensor the
    // same way a real browser does — read PointerSensor's activator/handleMove
    // logic in that file and adjust the event init dict (pointerId, button,
    // isPrimary) until it does; don't skip or weaken this test, it's the
    // direct regression check for the reported bug.
    fireEvent.pointerDown(card, { pointerId: 1, clientX: 100, clientY: 100, button: 0, isPrimary: true });
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 101, clientY: 100, isPrimary: true });
    fireEvent.pointerUp(document, { pointerId: 1, clientX: 101, clientY: 100, isPrimary: true });
    fireEvent.click(card);
    // Note: `overlay.className` includes the literal substring "opacity-100"
    // in BOTH the revealed and non-revealed states (the non-revealed variant
    // is now simply "opacity-0"), so a plain `toMatch(/opacity-100/)` as
    // written in the task brief would pass vacuously regardless of whether
    // the click was swallowed. Split into class tokens and check for the
    // standalone "opacity-100" token (only present when revealed) and the
    // absence of "opacity-0" (only present when not revealed) so the
    // assertion actually distinguishes the two states — confirmed via direct
    // instrumentation that this reproduces the real bug (see
    // task-2-report.md for the investigation).
    const overlayClasses = overlay.className.split(/\s+/);
    expect(overlayClasses).toContain('opacity-100');
    expect(overlayClasses).not.toContain('opacity-0');
  });

  it('calls onReorder with the moved item\'s id when using "move to front"', () => {
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
});
