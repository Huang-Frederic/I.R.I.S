import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PriceWithTrend } from './PriceWithTrend';
import { PriceTrendsProvider } from './PriceTrendsProvider';

vi.mock('./PriceTrendsProvider', async () => {
  const actual = await vi.importActual<typeof import('./PriceTrendsProvider')>('./PriceTrendsProvider');
  return {
    ...actual,
    usePriceTrendsContext: () => ({
      register: vi.fn(),
      getPoints: (id: string) =>
        id === 'with-history'
          ? [{ card_id: id, bucket_date: '2026-05-12', granularity: 'daily', cm_price_low: null, cm_price_trend: null, cm_price_avg: 3.80, source_freshness_days: 0 }]
          : [],
      loading: false,
    }),
  };
});

describe('<PriceWithTrend>', () => {
  it('renders the price formatted in EUR', () => {
    render(<PriceWithTrend cardId="x" cmPriceAvg={4.34} variant="inline" />);
    expect(screen.getByText(/4[.,]34/)).toBeInTheDocument();
  });

  it('renders no arrow when no history', () => {
    render(<PriceWithTrend cardId="no-history" cmPriceAvg={4.34} variant="inline" />);
    expect(screen.queryByLabelText(/hausse|baisse/i)).toBeNull();
  });

  it('renders an up arrow with green class when delta > 0', () => {
    render(<PriceWithTrend cardId="with-history" cmPriceAvg={4.34} variant="inline" />);
    const arrow = screen.getByLabelText(/hausse/i);
    expect(arrow.className).toMatch(/green/);
  });

  it('renders nothing meaningful when cmPriceAvg is null', () => {
    const { container } = render(<PriceWithTrend cardId="x" cmPriceAvg={null} variant="inline" />);
    expect(container.textContent).toBe('');
  });

  it('calls onPriceClick when the value is clicked', () => {
    const onClick = vi.fn();
    render(
      <PriceWithTrend cardId="x" cmPriceAvg={4.34} variant="inline" onPriceClick={onClick} />,
    );
    fireEvent.click(screen.getByText(/4[.,]34/));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
