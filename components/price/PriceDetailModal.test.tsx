import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PriceDetailModal } from './PriceDetailModal';

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({}),
}));

vi.mock('@/lib/api/price-history', () => ({
  fetchHistoryForCard: vi.fn().mockResolvedValue([]),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// PriceFreshnessBadge (consumed via PriceTrioBlock) calls useTranslations.
// Stub the hook with a passthrough so we don't need a NextIntlClientProvider.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const baseCard = {
  id: 'c1',
  set_name: 'Sword & Shield',
  set_code: 'swsh1',
  set_number: '001',
  card_name: 'Pikachu',
  language: 'en' as const,
  status: 'for_sale' as const,
  image_url: '/img.jpg',
  tcg_image_url: '/tcg.jpg',
  cm_price_low: 3.5,
  cm_price_trend: 4.0,
  cm_price_avg: 4.2,
  cm_updated_at: new Date().toISOString(),
  cardmarket_url: 'https://cardmarket.com/x',
} as any;

describe('<PriceDetailModal>', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <PriceDetailModal card={baseCard} open={false} onClose={() => {}} />,
    );
    expect(container.textContent).toBe('');
  });

  it('renders set name and Low/Trend/Avg cells when open', async () => {
    render(<PriceDetailModal card={baseCard} open={true} onClose={() => {}} />);
    expect(screen.getByText('Sword & Shield')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();
    expect(screen.getByText('Trend')).toBeInTheDocument();
    expect(screen.getByText('Avg')).toBeInTheDocument();
  });

  it('shows the no-history message when fewer than 2 points exist', async () => {
    render(<PriceDetailModal card={baseCard} open={true} onClose={() => {}} />);
    expect(await screen.findByText(/Pas encore d'historique/)).toBeInTheDocument();
  });

  it('calls onClose when × is clicked', () => {
    const onClose = vi.fn();
    render(<PriceDetailModal card={baseCard} open={true} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Fermer'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
