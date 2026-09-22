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
});
