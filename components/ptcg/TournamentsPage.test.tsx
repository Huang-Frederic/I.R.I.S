import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TournamentsPage, { type TournamentListRow } from './TournamentsPage';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
}));

const base: TournamentListRow = {
  id: 't1',
  user_id: 'u1',
  name: 'Meisia Cup',
  played_at: '2026-09-12',
  category: 'challenge',
  best_of: 1,
  placement: 'top_32',
  my_archetype_dex: [157],
  created_at: '',
  updated_at: '',
  rounds: [
    { games: [{ result: 'win', wentFirst: true }], outcome: null },
    { games: [{ result: 'loss', wentFirst: false }], outcome: null },
  ],
};

describe('<TournamentsPage>', () => {
  it('shows a friendly empty state with no tournaments', () => {
    render(<TournamentsPage initialTournaments={[]} />);
    expect(screen.getByText('noTournamentsYet')).toBeInTheDocument();
  });

  it("renders a row with the tournament's name and derived record", () => {
    render(<TournamentsPage initialTournaments={[base]} />);
    expect(screen.getByText('Meisia Cup')).toBeInTheDocument();
    expect(screen.getByText(/"wins":1,"losses":1,"ties":0/)).toBeInTheDocument();
  });

  it('filters the list by category', () => {
    const other: TournamentListRow = { ...base, id: 't2', name: 'Other Cup', category: 'online', rounds: [] };
    render(<TournamentsPage initialTournaments={[base, other]} />);

    fireEvent.change(screen.getByLabelText('categoryFilterAria'), { target: { value: 'online' } });

    expect(screen.queryByText('Meisia Cup')).not.toBeInTheDocument();
    expect(screen.getByText('Other Cup')).toBeInTheDocument();
  });

  it('opens the create-tournament modal on button click', () => {
    render(<TournamentsPage initialTournaments={[]} />);
    fireEvent.click(screen.getByText('newTournamentButton'));
    expect(screen.getByText('createTournamentTitle')).toBeInTheDocument();
  });
});
