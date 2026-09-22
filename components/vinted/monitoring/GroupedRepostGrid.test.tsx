// components/vinted/monitoring/GroupedRepostGrid.test.tsx
import type { ComponentProps } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import GroupedRepostGrid, { type RepostPoolItem } from './GroupedRepostGrid';

const ITEMS: RepostPoolItem[] = [
  { cardId: 'c1', lotId: null, name: 'Mimiqui V', price: 2, imageUrl: 'a.png', vintedPostedAt: '2026-01-01T00:00:00Z', groupKey: 'Pokémon FR', repostPosition: 1 },
  { cardId: 'c2', lotId: null, name: 'Démolosse V', price: 4, imageUrl: 'b.png', vintedPostedAt: '2026-01-02T00:00:00Z', groupKey: 'Pokémon FR', repostPosition: 2 },
  { cardId: null, lotId: 'l1', name: 'Lot Riftbound', price: 12, imageUrl: 'c.png', vintedPostedAt: '2026-01-03T00:00:00Z', groupKey: 'Riftbound', repostPosition: null },
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

describe('<GroupedRepostGrid>', () => {
  it('renders a connector between the two group frames and between same-group cards', () => {
    const { container } = renderGrid();
    // 1 between Mimiqui V/Démolosse V + 1 between the "Pokémon FR"/"Riftbound" frames = 2.
    expect(container.querySelectorAll('svg.lucide-chevron-right')).toHaveLength(2);
  });

  it('calls onViewListing with the clicked item, including lot items', () => {
    const onViewListing = vi.fn();
    renderGrid({ onViewListing });
    // Every card renders its own "Voir l'annonce" button, so scope the query
    // to the clicked card's overlay instead of screen.getByLabelText (which
    // would be ambiguous across all 3 cards).
    const card = screen.getByText('Lot Riftbound').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
    fireEvent.click(card);
    fireEvent.click(within(card).getByLabelText("Voir l'annonce", { selector: 'button' }));
    expect(onViewListing).toHaveBeenCalledWith(ITEMS[2]);
  });

  it('does not render the move/repost buttons when not editable, but still allows viewing the listing', () => {
    renderGrid({ editable: false });
    fireEvent.click(screen.getByText('Mimiqui V'));
    expect(screen.queryByLabelText('Reposter maintenant')).toBeNull();
    expect(screen.getAllByLabelText("Voir l'annonce", { selector: 'button' }).length).toBe(ITEMS.length);
  });

  it('still allows a plain click to reveal the overlay — regression test for the "clicking does nothing" bug (dnd-kit swallowing the click when no activationConstraint is set)', () => {
    renderGrid();
    const overlay = screen.getByText('Mimiqui V').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
    const card = overlay.parentElement as HTMLElement;
    // Same reproduction as GroupedQueueGrid.test.tsx's equivalent case — see
    // that file's comment for the exact dnd-kit mechanism this simulates.
    fireEvent.pointerDown(card, { pointerId: 1, clientX: 100, clientY: 100, button: 0, isPrimary: true });
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 101, clientY: 100, isPrimary: true });
    fireEvent.pointerUp(document, { pointerId: 1, clientX: 101, clientY: 100, isPrimary: true });
    fireEvent.click(card);
    // Note: `overlay.className` includes the literal substring "opacity-100"
    // in BOTH the revealed and non-revealed states (the non-revealed variant
    // is now simply "opacity-0"), so a plain `toMatch(/opacity-100/)` as
    // written in the task brief would pass vacuously regardless of whether
    // the click was swallowed. Split into class tokens instead so the
    // assertion actually distinguishes the two states.
    const classes = overlay.className.split(/\s+/);
    expect(classes).toContain('opacity-100');
    expect(classes).not.toContain('opacity-0');
  });

  it('calls onReorder with the moved item\'s id when using "move to front"', () => {
    const onReorder = vi.fn();
    renderGrid({ onReorder });
    const overlay = screen.getByText('Démolosse V').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
    fireEvent.click(overlay.parentElement as HTMLElement);
    fireEvent.click(within(overlay).getByLabelText('Mettre en premier dans le groupe'));
    expect(onReorder).toHaveBeenCalledWith(expect.any(Array), 'c2');
  });

  it('renders a persistent green dashed border for cards listed in pendingIds', () => {
    renderGrid({ pendingIds: new Set(['c2']) });
    const card = screen.getByText('Démolosse V').closest('[data-testid="poster-card-overlay"]')!.parentElement as HTMLElement;
    expect(card.className).toContain('border-staleness-fresh');
  });
});
