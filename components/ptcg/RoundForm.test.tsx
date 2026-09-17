import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RoundForm, { visibleGameCount } from './RoundForm';
import type { PtcgTournamentRoundRow, TournamentGame } from '@/lib/types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const win: TournamentGame = { result: 'win', wentFirst: true };
const loss: TournamentGame = { result: 'loss', wentFirst: false };
const tie: TournamentGame = { result: 'tie', wentFirst: null };

describe('visibleGameCount', () => {
  it('shows exactly 1 block for a Bo1 tournament, win or not', () => {
    expect(visibleGameCount([], 1)).toBe(1);
    expect(visibleGameCount([win], 1)).toBe(1);
  });

  it('shows a 2nd block once the 1st game is filled in a Bo3', () => {
    expect(visibleGameCount([], 3)).toBe(1);
    expect(visibleGameCount([win], 3)).toBe(2);
  });

  it('stops at 2 blocks once a side has clinched 2 wins (the LL example)', () => {
    expect(visibleGameCount([loss, loss], 3)).toBe(2);
    expect(visibleGameCount([win, win], 3)).toBe(2);
  });

  it('shows a 3rd block when the first two games split 1-1', () => {
    expect(visibleGameCount([win, loss], 3)).toBe(3);
  });

  it('never renders past a decided 3rd game (WLT example)', () => {
    expect(visibleGameCount([win, loss, tie], 3)).toBe(3);
  });
});

describe('<RoundForm> create mode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('disables Save until a game result or an outcome is chosen', () => {
    render(
      <RoundForm mode="create" open onClose={() => {}} tournamentId="t1" bestOf={1} onSaved={() => {}} />,
    );
    expect(screen.getByText('save')).toBeDisabled();

    fireEvent.click(screen.getByText('gameResult_win'));

    expect(screen.getByText('save')).not.toBeDisabled();
  });

  it('renders only 2 game blocks for a Bo3 that goes 2-0', () => {
    render(
      <RoundForm mode="create" open onClose={() => {}} tournamentId="t1" bestOf={3} onSaved={() => {}} />,
    );
    fireEvent.click(screen.getAllByText('gameResult_win')[0]);
    fireEvent.click(screen.getAllByText('gameResult_win')[1]);

    // 2 blocks means exactly 2 sets of W/L/T buttons — 6 total.
    expect(screen.getAllByText('gameResult_win')).toHaveLength(2);
  });

  it('selecting an outcome clears any entered games and disables the game buttons', () => {
    render(
      <RoundForm mode="create" open onClose={() => {}} tournamentId="t1" bestOf={1} onSaved={() => {}} />,
    );
    fireEvent.click(screen.getByText('gameResult_win'));
    fireEvent.click(screen.getByText('outcome_bye'));

    expect(screen.getByText('gameResult_win').closest('button')).toBeDisabled();
  });

  it('POSTs opponentArchetypeDex/games/outcome on Save', async () => {
    const savedRound: PtcgTournamentRoundRow = {
      id: 'r1',
      tournament_id: 't1',
      round_number: 1,
      opponent_archetype_dex: [],
      games: [win],
      outcome: null,
      created_at: '',
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ round: savedRound }) });
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();

    render(
      <RoundForm mode="create" open onClose={() => {}} tournamentId="t1" bestOf={1} onSaved={onSaved} />,
    );
    fireEvent.click(screen.getByText('gameResult_win'));
    fireEvent.click(screen.getByText('save'));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(savedRound));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ptcg/tournaments/t1/rounds',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('<RoundForm> edit mode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const round: PtcgTournamentRoundRow = {
    id: 'r1',
    tournament_id: 't1',
    round_number: 1,
    opponent_archetype_dex: [658],
    games: [win],
    outcome: null,
    created_at: '',
  };

  it('PATCHes the round id on Save', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ round }) });
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();

    render(
      <RoundForm mode="edit" open onClose={() => {}} tournamentId="t1" bestOf={1} round={round} onSaved={onSaved} />,
    );
    fireEvent.click(screen.getByText('save'));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(round));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ptcg/tournaments/t1/rounds/r1',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});
