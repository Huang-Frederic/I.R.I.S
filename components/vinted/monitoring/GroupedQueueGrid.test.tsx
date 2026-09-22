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
});
