import { describe, it, expect, vi } from 'vitest';
import { verifyByIllustrator } from './enrich-cross-validate';
import type { CatalogRow } from './tcg-catalog';
import type { EnrichResult, EnrichedCard, CardLanguage } from '@/lib/types';

function fakeMatch(overrides: Partial<EnrichedCard> = {}): EnrichedCard {
  return {
    card_id_tcg: 'BRS-3',
    card_name: 'Hisuian Electrode',
    pokemon_name: 'Hisuian Electrode',
    pokemon_number: 101,
    set_name: 'Brilliant Stars',
    set_code: 'BRS',
    set_number: '3',
    rarity: 'C',
    tcg_image_url: '',
    cardmarket_id: '',
    cm_price_low: null,
    cm_price_trend: null,
    cm_price_avg: null,
    ...overrides,
  };
}

/** Matched card whose pokemon_name agrees with OCR (Dracaufeu) — no gross mismatch. */
function dracaufeuMatch(overrides: Partial<EnrichedCard> = {}): EnrichedCard {
  return fakeMatch({
    card_name: 'Dracaufeu',
    pokemon_name: 'Dracaufeu',
    pokemon_number: 6,
    ...overrides,
  });
}

function row(overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    id: 'tg-row',
    cardmarket_id: '999',
    set_code: 'LOR',
    set_number: 'TG3',
    set_total: 30,
    language: 'FR' as CardLanguage,
    card_name: 'Dracaufeu',
    pokemon_name: 'Dracaufeu',
    pokemon_number: 6,
    set_name: 'Origines Perdues',
    rarity: 'SR',
    image_url: 'https://example.com/lor-tg3.jpg',
    illustrator: 'GIDORA',
    scraped_at: '2026-05-09T00:00:00Z',
    ...overrides,
  };
}

function buildSupabase(opts: {
  matchedIllustrator?: string | null;
  alternatives?: CatalogRow[];
  cardmarketIndexRows?: Array<{ id_product: number }>;
  cardmarketProducts?: Array<{ id_product: number; name: string; card_prefix_normalized: string }>;
  cardmarketCatalogRows?: CatalogRow[];
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'tcg_catalog') {
        return {
          select: vi.fn((cols?: string) => {
            if (cols === 'illustrator') {
              // fetchCatalogIllustrator: .ilike().in().eq().limit().maybeSingle()
              return {
                ilike: vi.fn().mockReturnThis(),
                in: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn(async () => ({
                  data:
                    opts.matchedIllustrator !== undefined
                      ? { illustrator: opts.matchedIllustrator }
                      : null,
                  error: null,
                })),
              };
            }
            // Two paths use select('*'): findCatalogAlternatives and the
            // cardmarket-id back-resolve. Distinguish by .in() column name
            // via call order is awkward, so just toggle: first '*' call
            // returns alternatives, subsequent return cardmarketCatalogRows.
            let callIdx = 0;
            return {
              in: vi.fn(function (this: unknown, col: string) {
                callIdx = col === 'cardmarket_id' ? 1 : 0;
                return this;
              }),
              eq: vi.fn().mockReturnThis(),
              limit: vi.fn(async () => ({
                data:
                  callIdx === 1
                    ? opts.cardmarketCatalogRows ?? []
                    : opts.alternatives ?? [],
                error: null,
              })),
            };
          }),
        };
      }
      if (table === 'cardmarket_card_index') {
        return {
          select: vi.fn(() => ({
            in: vi.fn().mockReturnThis(),
            limit: vi.fn(async () => ({
              data: opts.cardmarketIndexRows ?? [],
              error: null,
            })),
          })),
        };
      }
      if (table === 'cardmarket_products') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({
              data: opts.cardmarketProducts ?? [],
              error: null,
            })),
          })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe('verifyByIllustrator', () => {
  it('returns the result unchanged when no bestMatch', async () => {
    const supabase = buildSupabase({});
    const result: EnrichResult = { bestMatch: null, candidates: [] };
    const out = await verifyByIllustrator(
      {
        supabase: supabase as never,
        ocrIllustrator: 'GIDORA',
        ocrPokemonName: 'Dracaufeu',
        ocrSetNumber: 'TG3',
        ocrLanguage: 'FR',
      },
      result,
    );
    expect(out).toBe(result);
  });

  it('returns the result unchanged when OCR has no illustrator and pokemon names agree', async () => {
    const supabase = buildSupabase({});
    const matched = dracaufeuMatch();
    const result: EnrichResult = { bestMatch: matched, candidates: [matched] };
    const out = await verifyByIllustrator(
      {
        supabase: supabase as never,
        ocrIllustrator: null,
        ocrPokemonName: 'Dracaufeu',
        ocrSetNumber: 'TG3',
        ocrLanguage: 'FR',
      },
      result,
    );
    expect(out).toBe(result);
  });

  it('returns the result unchanged when illustrators match (and pokemon names agree)', async () => {
    const supabase = buildSupabase({ matchedIllustrator: 'GIDORA' });
    const matched = dracaufeuMatch();
    const result: EnrichResult = { bestMatch: matched, candidates: [matched] };
    const out = await verifyByIllustrator(
      {
        supabase: supabase as never,
        ocrIllustrator: 'gidora',
        ocrPokemonName: 'Dracaufeu',
        ocrSetNumber: 'TG3',
        ocrLanguage: 'FR',
      },
      result,
    );
    expect(out).toBe(result);
  });

  it('cross-searches when matched card has no catalog illustrator but OCR has one (LOR Dracaufeu case)', async () => {
    // matchedIllustrator omitted = catalog has no illustrator data for matched.
    // The OCR illustrator should still drive a cross-search across sets.
    const supabase = buildSupabase({ alternatives: [row()] });
    const matched = dracaufeuMatch(); // BRS-TG3 Dracaufeu (wrong set)
    const result: EnrichResult = { bestMatch: matched, candidates: [matched] };
    const out = await verifyByIllustrator(
      {
        supabase: supabase as never,
        ocrIllustrator: 'GIDORA',
        ocrPokemonName: 'Dracaufeu',
        ocrSetNumber: 'TG3',
        ocrLanguage: 'FR',
      },
      result,
    );
    // Cross-search auto-corrects to LOR-TG3 (the row()).
    expect(out.bestMatch?.set_code).toBe('LOR');
    expect(out.bestMatch?.cardmarket_id).toBe('999');
  });

  it('triggers cross-search on gross mismatch even without OCR illustrator (Pansage→Reshiram case)', async () => {
    const supabase = buildSupabase({
      alternatives: [
        row({
          set_code: 'BKR',
          set_number: '4',
          card_name: 'Reshiram EX',
          pokemon_name: 'Reshiram',
          illustrator: 'shizurow',
        }),
      ],
    });
    const matched = fakeMatch({
      card_name: 'Pansage',
      pokemon_name: 'Pansage',
    });
    const result: EnrichResult = { bestMatch: matched, candidates: [matched] };
    const out = await verifyByIllustrator(
      {
        supabase: supabase as never,
        ocrIllustrator: null,
        ocrPokemonName: 'Reshiram',
        ocrSetNumber: '4',
        ocrLanguage: 'JP',
      },
      result,
    );
    expect(out.bestMatch?.set_code).toBe('BKR');
    expect(out.bestMatch?.pokemon_name).toBe('Reshiram');
  });

  it('returns original when no alternative is found across sets', async () => {
    const supabase = buildSupabase({
      matchedIllustrator: '5ban Graphics',
      alternatives: [],
    });
    const matched = fakeMatch();
    const result: EnrichResult = { bestMatch: matched, candidates: [matched] };
    const out = await verifyByIllustrator(
      {
        supabase: supabase as never,
        ocrIllustrator: 'GIDORA',
        ocrPokemonName: 'Dracaufeu',
        ocrSetNumber: 'TG3',
        ocrLanguage: 'FR',
      },
      result,
    );
    expect(out).toBe(result);
  });

  it('auto-replaces bestMatch when exactly one alternative is found (LOR Charizard case)', async () => {
    const supabase = buildSupabase({
      matchedIllustrator: '5ban Graphics',
      alternatives: [row()], // single LOR-TG3 Dracaufeu
    });
    const matched = fakeMatch(); // BRS Hisuian Electrode (wrong)
    const result: EnrichResult = { bestMatch: matched, candidates: [matched] };
    const out = await verifyByIllustrator(
      {
        supabase: supabase as never,
        ocrIllustrator: 'GIDORA',
        ocrPokemonName: 'Dracaufeu',
        ocrSetNumber: 'TG3',
        ocrLanguage: 'FR',
      },
      result,
    );
    expect(out.bestMatch?.set_code).toBe('LOR');
    expect(out.bestMatch?.card_name).toBe('Dracaufeu');
    expect(out.bestMatch?.cardmarket_id).toBe('999');
    expect(out.candidates).toHaveLength(1);
  });

  it('exposes multiple candidates when several alternatives match', async () => {
    const supabase = buildSupabase({
      matchedIllustrator: '5ban Graphics',
      alternatives: [
        row({ id: 'a', cardmarket_id: '111', set_code: 'LOR' }),
        row({ id: 'b', cardmarket_id: '222', set_code: 'AST' }),
      ],
    });
    const matched = fakeMatch();
    const result: EnrichResult = { bestMatch: matched, candidates: [matched] };
    const out = await verifyByIllustrator(
      {
        supabase: supabase as never,
        ocrIllustrator: 'GIDORA',
        ocrPokemonName: 'Dracaufeu',
        ocrSetNumber: 'TG3',
        ocrLanguage: 'FR',
      },
      result,
    );
    expect(out.candidates).toHaveLength(2);
    expect(out.bestMatch?.set_code).toBe('LOR');
  });

  it('falls back to cardmarket_card_index when tcg_catalog has no alternatives (BKR Reshiram JP case)', async () => {
    const supabase = buildSupabase({
      // Catalog: matched is "Pansage" (gross mismatch with OCR Reshiram), but
      // catalog cross-search returns nothing (empty alternatives).
      alternatives: [],
      // Cardmarket index has card #4 across multiple expansions.
      cardmarketIndexRows: [
        { id_product: 569386 },
        { id_product: 835910 },
      ],
      // Products: 569386 is Reshiram (BKR), 835910 is Pansage (Black Bolt).
      cardmarketProducts: [
        { id_product: 569386, name: 'Reshiram EX', card_prefix_normalized: 'reshiram' },
        { id_product: 835910, name: 'Pansage [Collect | Scratch | SV]', card_prefix_normalized: 'pansage' },
      ],
      // Resolving 569386 back to tcg_catalog gives the right BKR Reshiram row.
      cardmarketCatalogRows: [
        row({
          id: 'bkr-reshiram',
          cardmarket_id: '569386',
          set_code: 'BKR',
          set_number: '4',
          card_name: 'Reshiram EX',
          pokemon_name: 'Reshiram',
          set_name: 'BREAKpoint',
          language: 'JP' as CardLanguage,
          illustrator: 'shizurow',
        }),
      ],
    });
    const matched = fakeMatch({
      card_name: 'Pansage',
      pokemon_name: 'Pansage',
    });
    const result: EnrichResult = { bestMatch: matched, candidates: [matched] };
    const out = await verifyByIllustrator(
      {
        supabase: supabase as never,
        ocrIllustrator: 'shizurow',
        ocrPokemonName: 'Reshiram',
        ocrSetNumber: '4',
        ocrLanguage: 'JP',
      },
      result,
    );
    expect(out.bestMatch?.cardmarket_id).toBe('569386');
    expect(out.bestMatch?.set_code).toBe('BKR');
    expect(out.bestMatch?.pokemon_name).toBe('Reshiram');
  });

  it('handles set_number normalization ("TG03/30" → "TG3" lookup)', async () => {
    const supabase = buildSupabase({
      matchedIllustrator: 'WRONG',
      alternatives: [row()],
    });
    const matched = fakeMatch();
    const result: EnrichResult = { bestMatch: matched, candidates: [matched] };
    const out = await verifyByIllustrator(
      {
        supabase: supabase as never,
        ocrIllustrator: 'GIDORA',
        ocrPokemonName: 'Dracaufeu',
        ocrSetNumber: 'TG03/30', // Raw OCR form
        ocrLanguage: 'FR',
      },
      result,
    );
    expect(out.bestMatch?.set_code).toBe('LOR');
  });
});
