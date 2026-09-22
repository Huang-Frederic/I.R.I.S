// components/vinted/monitoring/PosterCard.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { Eye } from 'lucide-react';
import PosterCard, { CardConnector, type PosterCardProps } from './PosterCard';

function renderCard(overrides: Partial<PosterCardProps> = {}) {
  const props: PosterCardProps = {
    id: 'card-1',
    imageUrl: 'https://example.com/card.png',
    name: 'Pikachu ex',
    price: 4.8,
    draggable: false,
    actions: [{ icon: Eye, label: "Voir l'annonce", onClick: vi.fn() }],
    ...overrides,
  };
  return render(
    <DndContext>
      <SortableContext items={[props.id]}>
        <PosterCard {...props} />
      </SortableContext>
    </DndContext>,
  );
}

describe('<PosterCard>', () => {
  it('hides the overlay by default', () => {
    renderCard();
    expect(screen.getByTestId('poster-card-overlay').className).toMatch(/opacity-0/);
  });

  it('reveals the overlay on click and lets an action fire', () => {
    const onClick = vi.fn();
    renderCard({ actions: [{ icon: Eye, label: "Voir l'annonce", onClick }] });
    fireEvent.click(screen.getByTestId('poster-card-overlay').parentElement as Element);
    expect(screen.getByTestId('poster-card-overlay').className).toMatch(/opacity-100/);
    fireEvent.click(screen.getByLabelText("Voir l'annonce"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows the position badge when provided', () => {
    renderCard({ badge: '#3' });
    expect(screen.getByText('#3')).toBeInTheDocument();
  });

  it('formats the price with two decimals and a euro sign', () => {
    renderCard({ price: 7 });
    expect(screen.getByText('7.00 €')).toBeInTheDocument();
  });

  it('omits the price line when price is null', () => {
    renderCard({ price: null });
    expect(screen.queryByText(/€/)).toBeNull();
  });

  it('disables an action button when marked disabled', () => {
    renderCard({ actions: [{ icon: Eye, label: "Voir l'annonce", onClick: vi.fn(), disabled: true }] });
    expect(screen.getByLabelText("Voir l'annonce")).toBeDisabled();
  });
});

describe('<CardConnector>', () => {
  it('renders an arrow icon', () => {
    const { container } = render(<CardConnector />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
