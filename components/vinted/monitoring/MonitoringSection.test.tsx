import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MonitoringSection from './MonitoringSection';
import { useMonitoringData } from './hooks/useMonitoringData';
import { fetchCardAnnonceTarget, fetchLotAnnonceTarget } from '@/lib/vinted/fetch-annonce-target';
import type { Card } from '@/lib/types';

vi.mock('@/lib/hooks/useUserContext', () => ({
  useUserContext: () => ({ myUserId: 'me', myName: 'Moi', partnerUserId: 'partner', partnerName: 'Partenaire' }),
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
  }),
}));
vi.mock('./hooks/useMonitoringData');
vi.mock('@/lib/vinted/fetch-annonce-target');
vi.mock('@/components/vinted/AnnonceModal', () => ({
  default: ({ card }: { card: { card_name: string } }) => <div data-testid="annonce-modal">{card.card_name}</div>,
}));
vi.mock('@/components/lots/LotAnnonceModal', () => ({
  default: ({ lot }: { lot: { name: string } }) => <div data-testid="lot-annonce-modal">{lot.name}</div>,
}));

// Deliberately partial fixture — the stubbed AnnonceModal only reads
// `card.card_name`, so this doesn't need every Card field. `as unknown as
// Card` sidesteps the structural mismatch instead of hand-filling ~20
// unrelated columns (see the full interface in lib/types/index.ts).
const CARD = {
  id: 'c1', card_name: 'Pharamp GX', suggested_price: 9.5, image_url: 'a.png', tcg_image_url: null,
  pokemon_number: 149, language: 'FR', rarity: 'R', rarity_rank: 1, condition: 'NM', status: 'for_sale',
  cardmarket_id: null, cardmarket_url: null, cm_price_low: null, cm_price_trend: null, cm_price_avg: null,
} as unknown as Card;

beforeEach(() => {
  vi.mocked(useMonitoringData).mockReturnValue({
    pipeline: [{ queueId: 'q1', cardId: 'c1', lotId: null, position: 1, name: 'Pharamp GX', price: 9.5, imageUrl: 'a.png', groupKey: 'Pokémon FR' }],
    schedule: [],
    config: { daily_quota: 8, repost_after_days: 14, group_priority: [] },
    logs: [],
    todayJobCount: 0,
    repostCandidates: [],
    sessionStatus: null,
    loading: false,
    refetch: vi.fn(),
  });
});

describe('<MonitoringSection> view listing', () => {
  it('opens the (stubbed) AnnonceModal with the fetched card after clicking "Voir l\'annonce"', async () => {
    vi.mocked(fetchCardAnnonceTarget).mockResolvedValue({ card: CARD, listings: [] });
    render(<MonitoringSection />);
    fireEvent.click(screen.getByText('Pharamp GX'));
    fireEvent.click(screen.getByLabelText("Voir l'annonce", { selector: 'button' }));
    await waitFor(() => expect(fetchCardAnnonceTarget).toHaveBeenCalledWith(expect.anything(), 'c1'));
    expect(await screen.findByTestId('annonce-modal')).toHaveTextContent('Pharamp GX');
  });

  it('does not open any modal when the fetch resolves to null', async () => {
    vi.mocked(fetchCardAnnonceTarget).mockResolvedValue(null);
    render(<MonitoringSection />);
    fireEvent.click(screen.getByText('Pharamp GX'));
    fireEvent.click(screen.getByLabelText("Voir l'annonce", { selector: 'button' }));
    await waitFor(() => expect(fetchCardAnnonceTarget).toHaveBeenCalled());
    expect(fetchLotAnnonceTarget).not.toHaveBeenCalled();
    expect(screen.queryByTestId('annonce-modal')).toBeNull();
  });
});
