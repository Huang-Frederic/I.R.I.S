// components/ptcg/BattleLogsPage.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BattleLogsPage, { type BattleLogGame } from './BattleLogsPage';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const gameA: BattleLogGame = {
  id: 'g1',
  played_at: '2026-09-16T10:00:00.000Z',
  me: 'Hisshiden',
  opponent: 'Bklee219',
  result: 'win',
  my_archetype_dex: [157],
  opponent_archetype_dex: [658],
};

describe('<BattleLogsPage>', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows the empty state when there are no games', () => {
    render(<BattleLogsPage initialGames={[]} />);
    expect(screen.getByText('noLogsYet')).toBeInTheDocument();
  });

  it('lists an existing game grouped under its day, showing the opponent name', () => {
    render(<BattleLogsPage initialGames={[gameA]} />);
    expect(screen.getByText('Bklee219')).toBeInTheDocument();
  });

  it('pastes a log, resolves it, and opens the Create Log modal pre-filled with the resolved decks', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        me: 'Hisshiden',
        opponent: 'NewOpponent',
        myArchetypeDex: [157],
        opponentArchetypeDex: [1],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<BattleLogsPage initialGames={[]} />);
    fireEvent.change(screen.getByPlaceholderText('importPlaceholder'), {
      target: { value: 'a pasted log' },
    });
    fireEvent.click(screen.getByText('addLogButton'));

    await waitFor(() => expect(screen.getByText('createLogTitle')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ptcg/games/resolve',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ raw: 'a pasted log' }) }),
    );
  });

  it('expands a game row to fetch and show its turn-by-turn log', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        game: {
          id: 'g1',
          me: 'Hisshiden',
          opponent: 'Bklee219',
          raw_log: 'Tour de Hisshiden\nHisshiden a fait une chose.',
          state: {
            snapshots: [{ line: 2, turnNumber: 1, event: {}, state: {} }],
            turns: [{ number: 1, player: 'Hisshiden', events: [0] }],
          },
          my_archetype_dex: [157],
          opponent_archetype_dex: [658],
        },
        myArchetypeDex: [157],
        opponentArchetypeDex: [658],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<BattleLogsPage initialGames={[gameA]} />);
    fireEvent.click(screen.getByText('Bklee219'));

    await waitFor(() =>
      expect(screen.getByText('Hisshiden a fait une chose.')).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/ptcg/games/g1');
  });
});
