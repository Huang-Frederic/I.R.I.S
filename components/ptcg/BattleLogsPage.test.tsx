// components/ptcg/BattleLogsPage.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BattleLogsPage, { type BattleLogGame } from './BattleLogsPage';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
  useLocale: () => 'fr',
}));

const gameA: BattleLogGame = {
  id: 'g1',
  played_at: '2026-09-16T10:00:00.000Z',
  me: 'Hisshiden',
  opponent: 'Bklee219',
  result: 'win',
  my_archetype_dex: [157],
  opponent_archetype_dex: [658],
  went_first: true,
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

  it('lists an existing game grouped under its day, showing the derived opponent deck name and who went first', () => {
    render(<BattleLogsPage initialGames={[gameA]} />);
    expect(screen.getByText(/Amphinobi/)).toBeInTheDocument();
    expect(screen.getByText('wentFirst')).toBeInTheDocument();
  });

  it("falls back to the opponent's username when their deck isn't classified yet", () => {
    render(<BattleLogsPage initialGames={[{ ...gameA, opponent_archetype_dex: [] }]} />);
    expect(screen.getByText(/Bklee219/)).toBeInTheDocument();
  });

  it('gives a tie no special row color — PTCG Live never produces a real tie', () => {
    render(<BattleLogsPage initialGames={[{ ...gameA, result: 'tie' }]} />);
    const row = screen.getByRole('button', { name: /Amphinobi/ });
    expect(row.className).not.toMatch(/amber/);
    expect(row.className).not.toMatch(/emerald|bg-red\/10/);
  });

  it('shows no 1st/2nd badge for a game imported before went_first existed', () => {
    render(<BattleLogsPage initialGames={[{ ...gameA, went_first: null }]} />);
    expect(screen.queryByText('wentFirst')).not.toBeInTheDocument();
    expect(screen.queryByText('wentSecond')).not.toBeInTheDocument();
  });

  const gameB: BattleLogGame = {
    ...gameA,
    id: 'g2',
    played_at: '2026-09-10T10:00:00.000Z',
    opponent_archetype_dex: [],
  };

  it('starts with only the most recent day expanded, older days collapsed', () => {
    render(<BattleLogsPage initialGames={[gameA, gameB]} />);
    expect(screen.getByText(/Amphinobi/)).toBeInTheDocument();
    expect(screen.queryByText(/Bklee219/)).not.toBeInTheDocument();
  });

  it('toggles a day open and closed on click', () => {
    render(<BattleLogsPage initialGames={[gameA, gameB]} />);
    const dayHeaders = screen.getAllByRole('button', { name: /\d/ });
    fireEvent.click(dayHeaders[1]);
    expect(screen.getByText(/Bklee219/)).toBeInTheDocument();

    fireEvent.click(dayHeaders[0]);
    expect(screen.queryByText(/Amphinobi/)).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByText(/Amphinobi/));

    await waitFor(() =>
      expect(screen.getByText('Hisshiden a fait une chose.')).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/ptcg/games/g1');
  });
});
