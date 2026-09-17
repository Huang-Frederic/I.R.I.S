import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TournamentModal from './TournamentModal';
import type { PtcgTournamentRow } from '@/lib/types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('<TournamentModal> create mode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('disables Save until a name is entered (date defaults to today)', () => {
    render(<TournamentModal mode="create" open onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByText('save')).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('tournamentNamePlaceholder'), {
      target: { value: 'Meisia Cup' },
    });

    expect(screen.getByText('save')).not.toBeDisabled();
  });

  it('POSTs the form fields on Save', async () => {
    const savedTournament: PtcgTournamentRow = {
      id: 't1',
      user_id: 'u1',
      name: 'Meisia Cup',
      played_at: '2026-09-12',
      category: 'online',
      best_of: 1,
      placement: 'no_placement',
      my_archetype_dex: [],
      created_at: '',
      updated_at: '',
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ tournament: savedTournament }) });
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();

    render(<TournamentModal mode="create" open onClose={() => {}} onSaved={onSaved} />);
    fireEvent.change(screen.getByPlaceholderText('tournamentNamePlaceholder'), {
      target: { value: 'Meisia Cup' },
    });
    fireEvent.click(screen.getByText('save'));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(savedTournament));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ptcg/tournaments',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('<TournamentModal> edit mode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const tournament: PtcgTournamentRow = {
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
  };

  it('pre-fills the form from the existing tournament', () => {
    render(<TournamentModal mode="edit" open onClose={() => {}} tournament={tournament} onSaved={() => {}} />);
    expect(screen.getByDisplayValue('Meisia Cup')).toBeInTheDocument();
  });

  it('PATCHes the tournament id on Save', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ tournament }) });
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();

    render(<TournamentModal mode="edit" open onClose={() => {}} tournament={tournament} onSaved={onSaved} />);
    fireEvent.click(screen.getByText('save'));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(tournament));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ptcg/tournaments/t1',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});
