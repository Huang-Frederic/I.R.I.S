import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MonitoringSection from './MonitoringSection';
import { useMonitoringData } from './hooks/useMonitoringData';
import { fetchCardAnnonceTarget, fetchLotAnnonceTarget } from '@/lib/vinted/fetch-annonce-target';
import type { Card, Lot } from '@/lib/types';

vi.mock('@/lib/hooks/useUserContext', () => ({
  useUserContext: () => ({ myUserId: 'me', myName: 'Moi', partnerUserId: 'partner', partnerName: 'Partenaire' }),
}));
// Table-aware: `useAgentStatus` (rendered inside <StatusBar>, which
// <MonitoringSection> mounts) issues a `.select().gte()` chain against
// `agent_heartbeats`, distinct from this test's own bare `.select('*')`
// config-table fetch — a single generic `select` stub can't satisfy both.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'agent_heartbeats') {
        return { select: () => ({ gte: () => Promise.resolve({ data: [], count: 0, error: null }) }) };
      }
      return { select: () => Promise.resolve({ data: [], error: null }) };
    },
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

// Same deliberately partial pattern as CARD — the stubbed LotAnnonceModal
// only reads `lot.name`.
const LOT = {
  id: 'l1', name: 'Lot Dresseurs FR', price: 15, language: 'FR', condition: 'NM',
  status: 'for_sale', is_lot: true, photo_urls: [], brand_label: null, extra_description: null,
} as unknown as Lot;

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

  it('opens the (stubbed) LotAnnonceModal with the fetched lot after clicking "Voir l\'annonce" on a lot queue item', async () => {
    vi.mocked(useMonitoringData).mockReturnValue({
      pipeline: [{ queueId: 'q2', cardId: null, lotId: 'l1', position: 1, name: 'Lot Dresseurs FR', price: 15, imageUrl: 'lot.png', groupKey: 'Lots FR' }],
      schedule: [],
      config: { daily_quota: 8, repost_after_days: 14, group_priority: [] },
      logs: [],
      todayJobCount: 0,
      repostCandidates: [],
      sessionStatus: null,
      loading: false,
      refetch: vi.fn(),
    });
    vi.mocked(fetchLotAnnonceTarget).mockResolvedValue({ lot: LOT });
    render(<MonitoringSection />);
    fireEvent.click(screen.getByText('Lot Dresseurs FR'));
    fireEvent.click(screen.getByLabelText("Voir l'annonce", { selector: 'button' }));
    await waitFor(() => expect(fetchLotAnnonceTarget).toHaveBeenCalledWith(expect.anything(), 'l1'));
    expect(await screen.findByTestId('lot-annonce-modal')).toHaveTextContent('Lot Dresseurs FR');
  });
});
