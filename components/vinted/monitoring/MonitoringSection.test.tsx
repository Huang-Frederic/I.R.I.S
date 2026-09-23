import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import MonitoringSection from './MonitoringSection';
import { useMonitoringData } from './hooks/useMonitoringData';
import { fetchCardAnnonceTarget, fetchLotAnnonceTarget } from '@/lib/vinted/fetch-annonce-target';
import type { Card, Lot } from '@/lib/types';
import type { PipelineItem } from './GroupedQueueGrid';

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
      return {
        select: () => Promise.resolve({ data: [], error: null }),
        update: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) }),
      };
    },
  }),
}));
vi.mock('./hooks/useMonitoringData');
vi.mock('./hooks/useActiveJob', () => ({ useActiveJob: () => ({ activeJob: null, pendingCount: 0 }) }));
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

// This suite's environment is happy-dom (vitest.config.ts), whose elements
// always report `clientWidth: 0` (no real layout engine) — left unstubbed,
// both grids' `useSnakeColumns` would collapse to 1 column, which moves
// reordered items into a different `rowIndex`-keyed row and unmounts/remounts
// their DOM node, breaking this suite's captured-element assertions across a
// reorder. Stub a 500px width so both grids resolve to the same 3-column
// value assumed by GroupedQueueGrid.test.tsx / GroupedRepostGrid.test.tsx.
const originalClientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 500 });
  vi.mocked(useMonitoringData).mockReturnValue({
    pipeline: [{ queueId: 'q1', cardId: 'c1', lotId: null, position: 1, name: 'Pharamp GX', price: 9.5, imageUrl: 'a.png', groupKey: 'Pokémon FR' }],
    schedule: [],
    config: { daily_quota: 8, repost_after_days: 14, group_priority: [] },
    logs: [],
    todayJobCount: 0,
    repostCandidates: [],
    loading: false,
    refetch: vi.fn(),
  });
});

afterEach(() => {
  if (originalClientWidthDescriptor) {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidthDescriptor);
  }
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

describe('<MonitoringSection> staged reorder + save', () => {
  const TWO_ITEM_PIPELINE: PipelineItem[] = [
    { queueId: 'q1', cardId: 'c1', lotId: null, position: 1, name: 'Pharamp GX', price: 9.5, imageUrl: 'a.png', groupKey: 'Pokémon FR' },
    { queueId: 'q2', cardId: 'c2', lotId: null, position: 2, name: 'Fulguris GX', price: 5, imageUrl: 'b.png', groupKey: 'Pokémon FR' },
  ];

  function mockPipeline(pipeline: PipelineItem[], refetch = vi.fn()) {
    vi.mocked(useMonitoringData).mockReturnValue({
      pipeline,
      schedule: [],
      config: { daily_quota: 8, repost_after_days: 14, group_priority: [] },
      logs: [],
      todayJobCount: 0,
      repostCandidates: [],
        loading: false,
      refetch,
    });
    return refetch;
  }

  it('stages a reorder locally (no refetch) and shows a Save button; clicking Save commits and clears it', async () => {
    const refetch = mockPipeline(TWO_ITEM_PIPELINE);
    render(<MonitoringSection />);
    expect(screen.queryByText('Enregistrer')).toBeNull();

    const overlay = screen.getByText('Fulguris GX').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
    fireEvent.click(overlay.parentElement as HTMLElement);
    fireEvent.click(within(overlay).getByLabelText('Mettre en premier dans le groupe'));

    expect(screen.getByText('Enregistrer')).toBeInTheDocument();
    expect(refetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Enregistrer'));
    await waitFor(() => expect(refetch).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Enregistrer')).toBeNull());
  });

  it('asks for confirmation before discarding a pending reorder when switching to the partner tab, and keeps the pending state if cancelled', () => {
    mockPipeline(TWO_ITEM_PIPELINE);
    // happy-dom (this project's test environment) doesn't implement
    // `window.confirm` at all, so `vi.spyOn(window, 'confirm')` fails with
    // "can only spy on a function. Received undefined" — stub it directly
    // via `vi.stubGlobal` instead (same pattern already used below for
    // `fetch`), since `window` and `globalThis` are the same object here.
    const confirmMock = vi.fn().mockReturnValue(false);
    vi.stubGlobal('confirm', confirmMock);
    render(<MonitoringSection />);

    const overlay = screen.getByText('Fulguris GX').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
    fireEvent.click(overlay.parentElement as HTMLElement);
    fireEvent.click(within(overlay).getByLabelText('Mettre en premier dans le groupe'));
    expect(screen.getByText('Enregistrer')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Partenaire'));

    expect(confirmMock).toHaveBeenCalledOnce();
    expect(screen.getByText('Enregistrer')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('clears the pending queue reorder after a successful "Poster maintenant"', async () => {
    mockPipeline(TWO_ITEM_PIPELINE);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    render(<MonitoringSection />);

    const fulgurisOverlay = screen.getByText('Fulguris GX').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
    fireEvent.click(fulgurisOverlay.parentElement as HTMLElement);
    fireEvent.click(within(fulgurisOverlay).getByLabelText('Mettre en premier dans le groupe'));
    expect(screen.getByText('Enregistrer')).toBeInTheDocument();

    const pharampOverlay = screen.getByText('Pharamp GX').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
    fireEvent.click(pharampOverlay.parentElement as HTMLElement);
    fireEvent.click(within(pharampOverlay).getByLabelText('Poster maintenant'));

    await waitFor(() => expect(screen.queryByText('Enregistrer')).toBeNull());
    vi.unstubAllGlobals();
  });

  it('keeps a persistent green border on the card that moved, until Save clears it', async () => {
    const refetch = mockPipeline(TWO_ITEM_PIPELINE);
    render(<MonitoringSection />);

    const overlay = screen.getByText('Fulguris GX').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
    const card = overlay.parentElement as HTMLElement;
    fireEvent.click(card);
    fireEvent.click(within(overlay).getByLabelText('Mettre en premier dans le groupe'));

    expect(card.className).toContain('border-staleness-fresh');

    fireEvent.click(screen.getByText('Enregistrer'));
    await waitFor(() => expect(refetch).toHaveBeenCalled());
    await waitFor(() => expect(card.className).not.toContain('border-staleness-fresh'));
  });

  it('clears the pending-change marker together with the staged pipeline after a successful "Poster maintenant"', async () => {
    mockPipeline(TWO_ITEM_PIPELINE);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    render(<MonitoringSection />);

    const fulgurisOverlay = screen.getByText('Fulguris GX').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
    const fulgurisCard = fulgurisOverlay.parentElement as HTMLElement;
    fireEvent.click(fulgurisCard);
    fireEvent.click(within(fulgurisOverlay).getByLabelText('Mettre en premier dans le groupe'));
    expect(fulgurisCard.className).toContain('border-staleness-fresh');

    const pharampOverlay = screen.getByText('Pharamp GX').closest('[data-testid="poster-card-overlay"]') as HTMLElement;
    fireEvent.click(pharampOverlay.parentElement as HTMLElement);
    fireEvent.click(within(pharampOverlay).getByLabelText('Poster maintenant'));

    await waitFor(() => expect(fulgurisCard.className).not.toContain('border-staleness-fresh'));
    vi.unstubAllGlobals();
  });
});
