import { afterEach, describe, expect, it, vi } from 'vitest';

const supabaseMock = { auth: { getUser: vi.fn() }, from: vi.fn() };
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(supabaseMock),
}));

// Only the fields buildBundle actually reads off a parsed game — see
// lib/ptcg/bundle.ts. The other PtcgParsedGame fields (winner, ambiguities,
// warnings) are set to trivial values since nothing in this path touches them.
const mockParsedGame = {
  parserVersion: 'test',
  logHash: 'deadbeef',
  me: 'Hisshiden',
  opponent: 'Bklee219',
  winner: 'Bklee219',
  result: 'loss' as const,
  prizesMe: 3,
  prizesOpponent: 6,
  turns: 5,
  state: { snapshots: [], turns: [] },
  validation: { ok: true, checks: [] },
  ambiguities: [],
  warnings: [],
};
vi.mock('@/lib/ptcg', () => ({ parseGame: vi.fn(() => mockParsedGame) }));
vi.mock('@/lib/ptcg/cards', () => ({
  collectCardRefs: vi.fn(() => []),
  resolveCards: vi.fn(async () => ({ cards: {} })),
}));
vi.mock('@/lib/ptcg/bundle', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ptcg/bundle')>();
  return {
    ...actual,
    validateBundle: vi.fn(() => ({ ok: true, errors: [], warnings: [] })),
  };
});

import { POST } from './route';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/ptcg/games', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function mockGamesInsert() {
  // ptcg_games: insert(...).select(...).single()
  const gamesSingle = vi.fn().mockResolvedValue({ data: { id: 'g1' }, error: null });
  const gamesSelect = vi.fn(() => ({ single: gamesSingle }));
  const gamesInsert = vi.fn(() => ({ select: gamesSelect }));

  // ptcg_cards: select('*').in(...) (looked up before resolveCards), and
  // upsert(...) (skipped here since resolveCards is mocked to resolve no
  // cards, but stubbed anyway so an unexpected call fails on assertion, not
  // on a thrown TypeError).
  const cardsIn = vi.fn().mockResolvedValue({ data: [] });
  const cardsSelect = vi.fn(() => ({ in: cardsIn }));
  const cardsUpsert = vi.fn().mockResolvedValue({ error: null });

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'ptcg_cards') return { select: cardsSelect, upsert: cardsUpsert };
    if (table === 'ptcg_games') return { insert: gamesInsert };
    throw new Error(`unmocked table: ${table}`);
  });
  return gamesInsert;
}

describe('POST /api/ptcg/games — archetype-dex override', () => {
  afterEach(() => vi.clearAllMocks());

  it('stores my_archetype_dex/opponent_archetype_dex as null when not provided', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const insert = mockGamesInsert();

    await POST(makeRequest({ raw: 'irrelevant — parseGame is mocked' }));

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ my_archetype_dex: null, opponent_archetype_dex: null }),
    );
  });

  it('stores an explicit archetype-dex override verbatim', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const insert = mockGamesInsert();

    await POST(
      makeRequest({
        raw: 'irrelevant — parseGame is mocked',
        myArchetypeDex: [155],
        opponentArchetypeDex: [658],
      }),
    );

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ my_archetype_dex: [155], opponent_archetype_dex: [658] }),
    );
  });
});
