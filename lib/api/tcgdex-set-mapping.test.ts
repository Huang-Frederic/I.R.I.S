import { describe, expect, it, beforeEach, vi } from 'vitest';
import { tcgdexCardId, tcgdexSetIdFromName, _resetCacheForTests } from './tcgdex-set-mapping';

// Mock global fetch
global.fetch = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  _resetCacheForTests();
});

describe('tcgdexSetIdFromName', () => {
  it('returns set id for a known name', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([
        { id: 'sv06', name: 'Twilight Masquerade', cardCount: { total: 226 } },
        { id: 'sv05', name: 'Temporal Forces', cardCount: { total: 218 } },
      ]),
    });
    const id = await tcgdexSetIdFromName('Twilight Masquerade', 'EN');
    expect(id).toBe('sv06');
  });

  it('is case-insensitive', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([
        { id: 'sv06', name: 'Twilight Masquerade', cardCount: { total: 226 } },
      ]),
    });
    const id = await tcgdexSetIdFromName('twilight masquerade', 'EN');
    expect(id).toBe('sv06');
  });

  it('returns null for unknown set name', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([
        { id: 'sv06', name: 'Twilight Masquerade', cardCount: { total: 226 } },
      ]),
    });
    const id = await tcgdexSetIdFromName('Unknown Set', 'EN');
    expect(id).toBeNull();
  });

  it('returns null when fetch fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network error'));
    const id = await tcgdexSetIdFromName('Some Set', 'EN');
    expect(id).toBeNull();
  });

  it('returns null when API returns error status', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });
    const id = await tcgdexSetIdFromName('Some Set', 'EN');
    expect(id).toBeNull();
  });

  it('returns null for null input', async () => {
    const id = await tcgdexSetIdFromName(null, 'EN');
    expect(id).toBeNull();
  });

  it('caches results per language', async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([
        { id: 'sv06', name: 'Twilight Masquerade', cardCount: { total: 226 } },
      ]),
    });

    // First call should fetch
    const id1 = await tcgdexSetIdFromName('Twilight Masquerade', 'EN');
    expect(id1).toBe('sv06');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second call with same language should use cache (no new fetch)
    const id2 = await tcgdexSetIdFromName('Twilight Masquerade', 'EN');
    expect(id2).toBe('sv06');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('fetches separately for different languages', async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([
        { id: 'sv06', name: 'Twilight Masquerade', cardCount: { total: 226 } },
      ]),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([
        { id: 'sv06', name: 'Mascarade Crépusculaire', cardCount: { total: 226 } },
      ]),
    });

    // EN call
    const idEN = await tcgdexSetIdFromName('Twilight Masquerade', 'EN');
    expect(idEN).toBe('sv06');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenNthCalledWith(1, 'https://api.tcgdex.net/v2/en/sets', expect.any(Object));

    // FR call should fetch again (different language)
    const idFR = await tcgdexSetIdFromName('Mascarade Crépusculaire', 'FR');
    expect(idFR).toBe('sv06');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(2, 'https://api.tcgdex.net/v2/fr/sets', expect.any(Object));
  });
});

describe('tcgdexCardId', () => {
  it('builds card id from set name and number', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([
        { id: 'sv06', name: 'Twilight Masquerade', cardCount: { total: 226 } },
      ]),
    });
    const id = await tcgdexCardId('Twilight Masquerade', '171', 'EN');
    expect(id).toBe('sv06-171');
  });

  it('returns null when set name not found', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([
        { id: 'sv06', name: 'Twilight Masquerade', cardCount: { total: 226 } },
      ]),
    });
    const id = await tcgdexCardId('Unknown Set', '171', 'EN');
    expect(id).toBeNull();
  });

  it('returns null when set number is null', async () => {
    const id = await tcgdexCardId('Some Set', null, 'EN');
    expect(id).toBeNull();
  });

  it('returns null when set name is null', async () => {
    const id = await tcgdexCardId(null, '171', 'EN');
    expect(id).toBeNull();
  });
});
