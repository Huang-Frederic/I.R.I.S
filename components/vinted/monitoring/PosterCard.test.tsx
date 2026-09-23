// components/vinted/monitoring/PosterCard.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { Eye } from 'lucide-react';
import PosterCard, {
  CardConnector,
  PosterCardStartSlot,
  PosterCardDragPreview,
  posterCardBorderClasses,
  type PosterCardProps,
} from './PosterCard';

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

function overlayClasses(): string[] {
  return screen.getByTestId('poster-card-overlay').className.split(/\s+/);
}

describe('<PosterCard>', () => {
  it('hides the overlay by default', () => {
    renderCard();
    expect(overlayClasses()).toContain('opacity-0');
    expect(overlayClasses()).not.toContain('opacity-100');
  });

  it('reveals the overlay on click and lets an action fire', () => {
    const onClick = vi.fn();
    renderCard({ actions: [{ icon: Eye, label: "Voir l'annonce", onClick }] });
    fireEvent.click(screen.getByTestId('poster-card-overlay').parentElement as Element);
    expect(overlayClasses()).toContain('opacity-100');
    fireEvent.click(screen.getByLabelText("Voir l'annonce"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('reveals the overlay on mouse hover and hides it again on mouse leave', () => {
    renderCard();
    const card = screen.getByTestId('poster-card-overlay').parentElement as HTMLElement;
    expect(overlayClasses()).toContain('opacity-0');
    fireEvent.mouseEnter(card);
    expect(overlayClasses()).toContain('opacity-100');
    fireEvent.mouseLeave(card);
    expect(overlayClasses()).toContain('opacity-0');
  });

  it('keeps the overlay revealed on mouse leave if it was click-toggled open (hover and click are additive, not exclusive)', () => {
    renderCard();
    const card = screen.getByTestId('poster-card-overlay').parentElement as HTMLElement;
    fireEvent.click(card);
    fireEvent.mouseEnter(card);
    fireEvent.mouseLeave(card);
    expect(overlayClasses()).toContain('opacity-100');
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

  it('shows the pending-change (green) border when isPendingChange is true, independent of live drag state', () => {
    renderCard({ isPendingChange: true });
    const card = screen.getByTestId('poster-card-overlay').parentElement as HTMLElement;
    expect(card.className).toContain('border-staleness-fresh');
  });

  it('does not show the pending-change border by default', () => {
    renderCard();
    const card = screen.getByTestId('poster-card-overlay').parentElement as HTMLElement;
    expect(card.className).not.toContain('border-staleness-fresh');
  });

  it('shows a red border by default', () => {
    renderCard();
    const card = screen.getByTestId('poster-card-overlay').parentElement as HTMLElement;
    expect(card.className).toContain('border-red');
  });

  it('turns an action button background red on hover', () => {
    renderCard();
    const button = screen.getByLabelText("Voir l'annonce");
    expect(button.className).toContain('hover:bg-red');
  });
});

describe('<CardConnector>', () => {
  it('renders a right-pointing chevron by default', () => {
    const { container } = render(<CardConnector />);
    expect(container.querySelector('svg.lucide-chevron-right')).toBeInTheDocument();
  });

  it('renders a left-pointing chevron when direction is left', () => {
    const { container } = render(<CardConnector direction="left" />);
    expect(container.querySelector('svg.lucide-chevron-left')).toBeInTheDocument();
  });

  it('renders an up-pointing chevron when direction is up', () => {
    const { container } = render(<CardConnector direction="up" />);
    expect(container.querySelector('svg.lucide-chevron-up')).toBeInTheDocument();
  });

  it('renders a bold red chevron', () => {
    const { container } = render(<CardConnector />);
    const icon = container.querySelector('svg') as SVGElement;
    expect(icon.getAttribute('class')).toContain('text-red');
    expect(icon.getAttribute('stroke-width')).toBe('3');
  });
});

describe('posterCardBorderClasses', () => {
  it('shows a green border for the card being dragged', () => {
    expect(posterCardBorderClasses({ isDragging: true, isPendingChange: false })).toBe('border border-staleness-fresh');
  });

  it('shows a green border for a pending (unsaved) change', () => {
    expect(posterCardBorderClasses({ isDragging: false, isPendingChange: true })).toBe('border border-staleness-fresh');
  });

  it('falls back to a plain red border otherwise', () => {
    expect(posterCardBorderClasses({ isDragging: false, isPendingChange: false })).toBe('border border-red');
  });

  it('shows the green border if both are true at once', () => {
    expect(posterCardBorderClasses({ isDragging: true, isPendingChange: true })).toBe('border border-staleness-fresh');
  });
});

describe('<PosterCardStartSlot>', () => {
  it('renders a monitor icon in a card-shaped slot', () => {
    const { container } = render(<PosterCardStartSlot />);
    expect(container.querySelector('svg.lucide-monitor')).toBeInTheDocument();
  });
});

describe('<PosterCardDragPreview>', () => {
  it('renders a scaled-up, solid white floating preview of the card', () => {
    const { container } = render(<PosterCardDragPreview imageUrl="https://example.com/card.png" />);
    const box = container.firstChild as HTMLElement;
    expect(box.className).toContain('scale-110');
    expect(box.className).toContain('bg-white');
    expect(box.querySelector('img')).toHaveAttribute('src', 'https://example.com/card.png');
  });
});
