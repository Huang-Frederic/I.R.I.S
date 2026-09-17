import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CreateLogModal from './CreateLogModal';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const resolved = {
  me: 'Hisshiden',
  opponent: 'Bklee219',
  myArchetypeDex: [157, 156],
  opponentArchetypeDex: [658],
};

describe('<CreateLogModal> create mode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('POSTs the raw log with the resolved archetype dex arrays on Save, and passes the full saved row through', async () => {
    const savedGame = { id: 'g1', played_at: '2026-09-16T10:00:00.000Z', result: 'win' as const };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ game: savedGame }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();

    render(
      <CreateLogModal
        mode="create"
        open
        onClose={() => {}}
        raw="the raw log text"
        resolved={resolved}
        onSaved={onSaved}
      />,
    );
    fireEvent.click(screen.getByText('save'));

    // The full row (not just { id }) reaches onSaved — Task 6 needs
    // played_at/result to prepend an accurate row without guessing.
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith({
        ...savedGame,
        myArchetypeDex: [157, 156],
        opponentArchetypeDex: [658],
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ptcg/games',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          raw: 'the raw log text',
          myArchetypeDex: [157, 156],
          opponentArchetypeDex: [658],
        }),
      }),
    );
  });

  it("passes the corrected archetype dex to onSaved, not the original resolved prop, when the user fixes a sprite before saving", async () => {
    const savedGame = { id: 'g1', played_at: '2026-09-16T10:00:00.000Z', result: 'win' as const };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ game: savedGame }) });
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();

    render(
      <CreateLogModal
        mode="create"
        open
        onClose={() => {}}
        raw="the raw log text"
        resolved={resolved}
        onSaved={onSaved}
      />,
    );

    // Correct my deck's first slot (auto-detected as dex 157) to Dracaufeu (6).
    fireEvent.click(screen.getAllByRole('button', { name: 'profileSpriteLabel' })[0]);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'dracaufeu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dracaufeu' }));

    fireEvent.click(screen.getByText('save'));

    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith(
        expect.objectContaining({ myArchetypeDex: [6, 156], opponentArchetypeDex: [658] }),
      ),
    );
  });
});

describe('<CreateLogModal> edit mode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('PATCHes the archetype dex arrays for the given game id on Save', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ game: { id: 'g1', my_archetype_dex: [157, 156], opponent_archetype_dex: [658] } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();

    render(
      <CreateLogModal mode="edit" open onClose={() => {}} gameId="g1" resolved={resolved} onSaved={onSaved} />,
    );
    fireEvent.click(screen.getByText('save'));

    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith({ myArchetypeDex: [157, 156], opponentArchetypeDex: [658] }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ptcg/games/g1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ myArchetypeDex: [157, 156], opponentArchetypeDex: [658] }),
      }),
    );
  });

  it('shows the server error message and does not call onSaved when the request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'nope' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();

    render(
      <CreateLogModal mode="edit" open onClose={() => {}} gameId="g1" resolved={resolved} onSaved={onSaved} />,
    );
    fireEvent.click(screen.getByText('save'));

    await waitFor(() => expect(screen.getByText('nope')).toBeInTheDocument());
    expect(onSaved).not.toHaveBeenCalled();
  });
});
