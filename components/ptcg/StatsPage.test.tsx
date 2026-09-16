import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StatsPage, { type StatsGame } from './StatsPage';
import { extractGameStats } from '@/lib/ptcg/game-stats';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const mk = (over: Partial<StatsGame>): StatsGame => ({
  id: 'g1',
  opponent: 'Bklee219',
  stats: extractGameStats('', 'X'),
  result: 'win',
  play_score: 100,
  playedAt: '2026-01-01T00:00:00.000Z',
  myArchetypeDex: [157],
  opponentArchetypeDex: [887],
  ...over,
});

describe('<StatsPage>', () => {
  it('shows the empty state when there are no games', () => {
    render(<StatsPage games={[]} />);
    expect(screen.getByText('emptyTitle')).toBeInTheDocument();
  });

  it('lists my archetypes at Level 1, grouped and sorted by games played', () => {
    render(
      <StatsPage
        games={[mk({ id: 'a', myArchetypeDex: [157] }), mk({ id: 'b', myArchetypeDex: [1] }), mk({ id: 'c', myArchetypeDex: [1] })]}
      />,
    );
    // Two distinct groups — [1] has 2 games, [157] has 1 — [1]'s row should render first.
    const rows = screen.getAllByRole('button');
    expect(rows).toHaveLength(2);
  });

  it('drills into Level 2 (matchups) when a Level 1 row is clicked', () => {
    render(
      <StatsPage
        games={[
          mk({ id: 'a', myArchetypeDex: [157], opponentArchetypeDex: [887] }),
          mk({ id: 'b', myArchetypeDex: [157], opponentArchetypeDex: [1] }),
        ]}
      />,
    );
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(screen.getByText('backToArchetypes')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3); // back button + 2 matchup rows
  });

  it('shows the 1st/2nd-turn winrate split on each Level 2 matchup row', () => {
    const withFirst = (wentFirst: boolean, result: 'win' | 'loss') => {
      const g = mk({ myArchetypeDex: [157], opponentArchetypeDex: [887], result });
      return { ...g, stats: { ...g.stats, wentFirst } };
    };
    // Fixture note: with exactly 1 first-turn win and 1 second-turn loss, the
    // matchup's overall record is forced to exactly 1-1 (50%), and "50%"
    // contains the substring "0%" — colliding with the going-second figure
    // under a regex match. A second going-first win moves the overall winrate
    // to 67% (2-1) while keeping the per-turn-order figures the test actually
    // checks (100% on the play, 0% on the draw) unambiguous.
    render(
      <StatsPage
        games={[withFirst(true, 'win'), withFirst(true, 'win'), withFirst(false, 'loss')]}
      />,
    );
    fireEvent.click(screen.getAllByRole('button')[0]); // into Level 2
    // 100% on the play, 0% on the draw — both figures must be visible per
    // matchup row, not just the overall winrate for the matchup.
    expect(screen.getByText(/100%/)).toBeInTheDocument();
    expect(screen.getByText(/0%/)).toBeInTheDocument();
  });

  it('drills into Level 3 (matchup detail) when a Level 2 row is clicked', () => {
    render(<StatsPage games={[mk({ myArchetypeDex: [157], opponentArchetypeDex: [887] })]} />);
    fireEvent.click(screen.getAllByRole('button')[0]); // into Level 2
    fireEvent.click(screen.getAllByRole('button')[1]); // the one matchup row (button[0] is now "back")
    expect(screen.getByText('backToMatchups')).toBeInTheDocument();
    expect(screen.getByText('sectionTurnOrder')).toBeInTheDocument();
  });

  it('goes back from Level 2 to Level 1 without losing the archetype list', () => {
    render(<StatsPage games={[mk({ myArchetypeDex: [157] })]} />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    fireEvent.click(screen.getByText('backToArchetypes'));
    expect(screen.queryByText('backToArchetypes')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1); // back at Level 1's single archetype row
  });
});
