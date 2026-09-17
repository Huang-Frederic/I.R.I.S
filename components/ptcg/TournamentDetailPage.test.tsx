import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TournamentDetailPage from './TournamentDetailPage';
import type { PtcgTournamentRoundRow, PtcgTournamentRow } from '@/lib/types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
}));

const tournament: PtcgTournamentRow = {
  id: 't1',
  user_id: 'u1',
  name: 'Meisia Cup',
  played_at: '2026-09-12',
  category: 'challenge',
  best_of: 3,
  placement: 'top_32',
  my_archetype_dex: [157],
  created_at: '',
  updated_at: '',
};

const rounds: PtcgTournamentRoundRow[] = [
  {
    id: 'r1',
    tournament_id: 't1',
    round_number: 1,
    opponent_archetype_dex: [658],
    games: [
      { result: 'win', wentFirst: true },
      { result: 'loss', wentFirst: false },
      { result: 'win', wentFirst: true },
    ],
    outcome: null,
    created_at: '',
  },
  {
    id: 'r2',
    tournament_id: 't1',
    round_number: 2,
    opponent_archetype_dex: [],
    games: [],
    outcome: 'bye',
    created_at: '',
  },
];

describe('<TournamentDetailPage>', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders the tournament header, and each round's result string", () => {
    render(<TournamentDetailPage tournament={tournament} initialRounds={rounds} />);
    expect(screen.getByText('Meisia Cup')).toBeInTheDocument();
    expect(screen.getByText('WLW')).toBeInTheDocument();
    expect(screen.getByText('outcome_bye')).toBeInTheDocument();
  });

  it('shows a friendly empty state with no rounds', () => {
    render(<TournamentDetailPage tournament={tournament} initialRounds={[]} />);
    expect(screen.getByText('noRoundsYet')).toBeInTheDocument();
  });

  it('opens the add-round form on button click', () => {
    render(<TournamentDetailPage tournament={tournament} initialRounds={[]} />);
    fireEvent.click(screen.getByText('addRoundButton'));
    expect(screen.getByText('addRoundTitle')).toBeInTheDocument();
  });

  it('deletes a round after confirming', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<TournamentDetailPage tournament={tournament} initialRounds={rounds} />);
    fireEvent.click(screen.getAllByLabelText('deleteRoundAria')[0]);
    expect(screen.getByText('deleteRoundTitle')).toBeInTheDocument();
    // Confirm button inside ConfirmDialog carries the shared "delete" label.
    fireEvent.click(screen.getByText('delete'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/ptcg/tournaments/t1/rounds/r1',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
    await waitFor(() => expect(screen.queryByText('WLW')).not.toBeInTheDocument());
  });
});
