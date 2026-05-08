import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  rowToEnrichedCard,
  disambiguateByIllustrator,
  disambiguateByName,
  normalizeSetNumber,
  normalizeSetCode,
  lookupByCode,
  lookupByNameAndLocalId,
  formatBilingualName,
  deriveCardNameFr,
  type CatalogRow,
} from './tcg-catalog';

const baseRow: CatalogRow = {
  id: '00000000-0000-0000-0000-000000000001',
  cardmarket_id: '12345',
  set_code: 'SV11W',
  set_number: '012',
  set_total: 86,
  language: 'JP',
  card_name: 'チャオブー',
  pokemon_name: 'チャオブー',
  pokemon_number: 499,
  set_name: 'Battle Partners',
  rarity: 'C',
  image_url: 'https://product-images.s3.cardmarket.com/12345.jpg',
  illustrator: null,
  scraped_at: '2026-04-28T12:00:00Z',
};

describe('rowToEnrichedCard', () => {
  it('maps a catalog row into the EnrichedCard shape used by the form', () => {
    const enriched = rowToEnrichedCard(baseRow);
    expect(enriched).toEqual({
      card_id_tcg: 'SV11W-012',
      card_name: 'チャオブー',
      pokemon_name: 'チャオブー',
      pokemon_number: 499,
      set_name: 'Battle Partners',
      set_code: 'SV11W',
      set_number: '012/86',
      rarity: 'C',
      tcg_image_url: 'https://product-images.s3.cardmarket.com/12345.jpg',
      cardmarket_id: '12345',
      cm_price_low: null,
      cm_price_trend: null,
      cm_price_avg: null,
    });
  });

  it('omits set_total when null', () => {
    const enriched = rowToEnrichedCard({ ...baseRow, set_total: null });
    expect(enriched.set_number).toBe('012');
  });

  it('falls back to OTHER rarity when null', () => {
    const enriched = rowToEnrichedCard({ ...baseRow, rarity: null });
    expect(enriched.rarity).toBe('OTHER');
  });
});

describe('disambiguateByName', () => {
  const a: CatalogRow = { ...baseRow, set_code: 'M3', card_name: 'ビビヨン', pokemon_name: 'ビビヨン' };
  const b: CatalogRow = { ...baseRow, set_code: 'BW5', card_name: 'ホウオウEX', pokemon_name: 'ホウオウ' };
  const c: CatalogRow = { ...baseRow, set_code: 'SM8b', card_name: 'レントラー', pokemon_name: 'レントラー' };

  it('returns the single name match when OCR text contains exactly one card name', () => {
    const ocr = '... ホウオウEX HP 160 ...';
    const result = disambiguateByName([a, b, c], ocr);
    expect(result.best).toBe(b);
    expect(result.candidates).toEqual([b]);
  });

  it('returns the matching subset when OCR text matches multiple names', () => {
    const ocr = '... ビビヨン ... レントラー ...';
    const result = disambiguateByName([a, b, c], ocr);
    expect(result.candidates).toEqual([a, c]);
    expect(result.best).toBe(a);
  });

  it('returns null best (and all candidates) when no name matches OCR text', () => {
    const ocr = '... ピカチュウ ...';
    const result = disambiguateByName([a, b, c], ocr);
    expect(result.best).toBeNull();
    expect(result.candidates).toEqual([a, b, c]);
  });

  it('returns null/empty when given no candidates', () => {
    expect(disambiguateByName([], 'any text')).toEqual({ best: null, candidates: [] });
  });

  it('matches by pokemon_name when card_name has a suffix the OCR misses', () => {
    // Cardmarket card_name "Charizard ex" but OCR may only have read "Charizard"
    const charizardEx: CatalogRow = {
      ...baseRow,
      set_code: 'SVI',
      card_name: 'Charizard ex',
      pokemon_name: 'Charizard',
    };
    const pikachu: CatalogRow = {
      ...baseRow,
      set_code: 'SVI',
      card_name: 'Pikachu V',
      pokemon_name: 'Pikachu',
    };
    const ocr = '... Charizard HP 330 ...';
    const result = disambiguateByName([charizardEx, pikachu], ocr);
    expect(result.best).toBe(charizardEx);
    expect(result.candidates).toEqual([charizardEx]);
  });
});

describe('normalizeSetNumber', () => {
  it('strips leading zeros from numeric set_number ("012" → "12")', () => {
    expect(normalizeSetNumber('012')).toBe('12');
    expect(normalizeSetNumber('009')).toBe('9');
    expect(normalizeSetNumber('001')).toBe('1');
  });

  it('leaves single-digit numbers unchanged', () => {
    expect(normalizeSetNumber('1')).toBe('1');
    expect(normalizeSetNumber('9')).toBe('9');
  });

  it('preserves multi-digit numbers without leading zeros', () => {
    expect(normalizeSetNumber('111')).toBe('111');
    expect(normalizeSetNumber('254')).toBe('254');
  });

  it('handles "0" without dropping to empty string', () => {
    expect(normalizeSetNumber('0')).toBe('0');
    expect(normalizeSetNumber('00')).toBe('0');
  });

  it('passes alphanumeric set_numbers through unchanged (defensive)', () => {
    expect(normalizeSetNumber('TG01')).toBe('TG01');
    expect(normalizeSetNumber('SR-12')).toBe('SR-12');
  });
});

describe('normalizeSetCode', () => {
  it('strips dashes and lowercases for promo sets ("SM-P" → "smp")', () => {
    expect(normalizeSetCode('SM-P')).toBe('smp');
    expect(normalizeSetCode('XY-P')).toBe('xyp');
  });

  it('lowercases mixed-case codes ("SV11W" → "sv11w")', () => {
    expect(normalizeSetCode('SV11W')).toBe('sv11w');
    expect(normalizeSetCode('sv11w')).toBe('sv11w');
  });

  it('preserves alphanumerics and lowercases ("BW5n" → "bw5n")', () => {
    expect(normalizeSetCode('BW5n')).toBe('bw5n');
    expect(normalizeSetCode('sm8b')).toBe('sm8b');
  });

  it('handles codes that are already normalized', () => {
    expect(normalizeSetCode('smp')).toBe('smp');
    expect(normalizeSetCode('xyp')).toBe('xyp');
  });

  it('strips all non-alphanumeric characters', () => {
    expect(normalizeSetCode('S4-a')).toBe('s4a');
    expect(normalizeSetCode('BW_5')).toBe('bw5');
    expect(normalizeSetCode('XY/P')).toBe('xyp');
  });
});

describe('lookupByCode', () => {
  it('returns null when normalized set_code is empty', async () => {
    // Mock the supabase client to verify lookupByCode short-circuits on empty normalized code
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    } as unknown as SupabaseClient;

    const result = await lookupByCode(mockSupabase, '---', '12', 'JP');
    expect(result).toBeNull();
  });
});

describe('disambiguateByIllustrator', () => {
  it('returns null when geminiIllustrator is null/empty', () => {
    const rows = [{ ...baseRow, illustrator: 'Ryuta Fuse' }];
    expect(disambiguateByIllustrator(rows, null)).toBeNull();
    expect(disambiguateByIllustrator(rows, '')).toBeNull();
    expect(disambiguateByIllustrator(rows, undefined)).toBeNull();
  });

  it('returns null on empty rows', () => {
    expect(disambiguateByIllustrator([], 'Ryuta Fuse')).toBeNull();
  });

  it('matches case-insensitively + ignores whitespace', () => {
    const rows = [
      { ...baseRow, set_code: 'A', illustrator: 'Mitsuhiro Arita' },
      { ...baseRow, set_code: 'B', illustrator: 'Ryuta Fuse' },
    ];
    expect(disambiguateByIllustrator(rows, 'RYUTAFUSE')?.set_code).toBe('B');
    expect(disambiguateByIllustrator(rows, 'mitsuhiro arita')?.set_code).toBe('A');
  });

  it('matches via substring (Gemini may return partial name)', () => {
    const rows = [
      { ...baseRow, set_code: 'A', illustrator: 'YASHIRO Nanaco' },
    ];
    expect(disambiguateByIllustrator(rows, 'YASHIRO')?.set_code).toBe('A');
    expect(disambiguateByIllustrator(rows, 'yashiro nanaco')?.set_code).toBe('A');
  });

  it('returns null when no row has a matching illustrator', () => {
    const rows = [
      { ...baseRow, illustrator: 'Mitsuhiro Arita' },
      { ...baseRow, illustrator: 'Ryuta Fuse' },
    ];
    expect(disambiguateByIllustrator(rows, 'Ken Sugimori')).toBeNull();
  });

  it('skips rows with null illustrator (not yet scraped)', () => {
    const rows = [
      { ...baseRow, set_code: 'A', illustrator: null },
      { ...baseRow, set_code: 'B', illustrator: 'kirisAki' },
    ];
    expect(disambiguateByIllustrator(rows, 'kirisAki')?.set_code).toBe('B');
  });
});

describe('lookupByNameAndLocalId', () => {
  it('returns empty array on blank pokemon name', async () => {
    const mockSupabase = {} as unknown as SupabaseClient;
    const result = await lookupByNameAndLocalId(mockSupabase, '   ', '50', 'FR');
    expect(result).toEqual([]);
  });

  it('queries by normalized set_number + language with name ILIKE pattern', async () => {
    const matches = [
      { ...baseRow, card_name: 'Raichu-GX', pokemon_name: 'Raichu', set_code: 'BUS', set_number: '50' },
      { ...baseRow, card_name: 'Raichu', pokemon_name: 'Raichu', set_code: 'XY9', set_number: '50' },
    ];
    const limitFn = vi.fn().mockResolvedValue({ data: matches, error: null });
    const orFn = vi.fn(() => ({ limit: limitFn }));
    const eq2 = vi.fn(() => ({ or: orFn }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const select = vi.fn(() => ({ eq: eq1 }));
    const mockSupabase = { from: vi.fn(() => ({ select })) } as unknown as SupabaseClient;

    const result = await lookupByNameAndLocalId(mockSupabase, 'Raichu', '050', 'FR');
    expect(result).toEqual(matches);
    expect(eq1).toHaveBeenCalledWith('set_number', '50'); // zero-stripped
    expect(eq2).toHaveBeenCalledWith('language', 'FR');
    // OR clause searches both pokemon_name and card_name
    expect(orFn).toHaveBeenCalledWith(expect.stringContaining('pokemon_name.ilike.%Raichu%'));
    expect(orFn).toHaveBeenCalledWith(expect.stringContaining('card_name.ilike.%Raichu%'));
  });

  it('throws on supabase error', async () => {
    const limitFn = vi.fn().mockResolvedValue({ data: null, error: { message: 'oops' } });
    const orFn = vi.fn(() => ({ limit: limitFn }));
    const eq2 = vi.fn(() => ({ or: orFn }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const select = vi.fn(() => ({ eq: eq1 }));
    const mockSupabase = { from: vi.fn(() => ({ select })) } as unknown as SupabaseClient;
    await expect(lookupByNameAndLocalId(mockSupabase, 'Raichu', '50', 'FR')).rejects.toThrow(/oops/);
  });
});

describe('formatBilingualName', () => {
  it('formats as "FR (Original)" when original is JP and FR is provided', () => {
    expect(formatBilingualName('チャオブー', 'Gruikui', 'JP')).toBe('Gruikui (チャオブー)');
  });

  it('returns original when frenchName is null', () => {
    expect(formatBilingualName('チャオブー', null, 'JP')).toBe('チャオブー');
  });

  it('returns original when frenchName is empty string', () => {
    expect(formatBilingualName('チャオブー', '', 'JP')).toBe('チャオブー');
  });

  it('returns original when language is already FR', () => {
    expect(formatBilingualName('Gruikui', 'Gruikui', 'FR')).toBe('Gruikui');
  });

  it('returns original when frenchName equals original (case-insensitive)', () => {
    expect(formatBilingualName('Pikachu', 'Pikachu', 'EN')).toBe('Pikachu');
    expect(formatBilingualName('pikachu', 'Pikachu', 'EN')).toBe('pikachu');
  });

  it('formats EN cards with FR translation', () => {
    expect(formatBilingualName('Charizard', 'Dracaufeu', 'EN')).toBe('Dracaufeu (Charizard)');
  });

  it('handles whitespace in frenchName', () => {
    expect(formatBilingualName('ホウオウ', '  Ho-Oh  ', 'JP')).toBe('  Ho-Oh   (ホウオウ)');
  });
});

describe('deriveCardNameFr', () => {
  it('returns just pokemon name when no suffix', () => {
    expect(deriveCardNameFr('チャオブー', 'Gruikui')).toBe('Gruikui');
  });

  it('appends "ex" suffix when present', () => {
    expect(deriveCardNameFr('チャオブーex', 'Gruikui')).toBe('Gruikui ex');
  });

  it('appends "EX" suffix when present (uppercase)', () => {
    expect(deriveCardNameFr('ホウオウEX', 'Ho-Oh')).toBe('Ho-Oh EX');
  });

  it('appends "VMAX" suffix', () => {
    expect(deriveCardNameFr('リザードンVMAX', 'Charizard')).toBe('Charizard VMAX');
  });

  it('appends "V" suffix', () => {
    expect(deriveCardNameFr('ピカチュウV', 'Pikachu')).toBe('Pikachu V');
  });

  it('appends "GX" suffix', () => {
    expect(deriveCardNameFr('ルガルガンGX', 'Lycanroc')).toBe('Lycanroc GX');
  });

  it('appends "VSTAR" suffix', () => {
    expect(deriveCardNameFr('アルセウスVSTAR', 'Arceus')).toBe('Arceus VSTAR');
  });

  it('returns null when pokemonNameFr is null', () => {
    expect(deriveCardNameFr('ピカチュウV', null)).toBeNull();
  });

  it('returns null when pokemonNameFr is empty', () => {
    expect(deriveCardNameFr('ピカチュウV', '')).toBeNull();
  });

  it('handles suffix with spaces/dashes', () => {
    expect(deriveCardNameFr('Charizard ex', 'Dracaufeu')).toBe('Dracaufeu ex');
  });
});
