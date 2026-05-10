import { describe, it, expect, vi } from 'vitest';
import { lookupCardmarketStrategy0 } from './cardmarket-enrich';

/**
 * Build a mock Supabase client whose `.from(table)` returns an awaitable
 * thenable for `cardmarket_expansions` (full list) and a chainable .eq().single()
 * for the lookup tables. Matches the shape used by lookupCardmarketStrategy0
 * after the SQL-injection-safe refactor.
 */
function mockSupabase(opts: {
  expansions?: Array<{
    id_expansion: number;
    name: string | null;
    name_en: string | null;
    name_ja: string | null;
  }> | null;
  indexRow?: { id_product: number; url_path: string | null } | null;
  product?: { id_product: number; name: string } | null;
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'cardmarket_expansions') {
        // Returns a thenable so `await supabase.from(...).select(...)` resolves
        // to { data, error }.
        return {
          select: vi.fn(() =>
            Promise.resolve({ data: opts.expansions ?? null, error: null }),
          ),
        };
      }
      if (table === 'cardmarket_card_index') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn(async () => ({ data: opts.indexRow ?? null, error: null })),
        };
      }
      if (table === 'cardmarket_products') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn(async () => ({ data: opts.product ?? null, error: null })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe('lookupCardmarketStrategy0', () => {
  it('returns null when set_name does not match any expansion', async () => {
    const supabase = mockSupabase({
      expansions: [
        { id_expansion: 1234, name: 'Other Set', name_en: 'Other Set', name_ja: null },
      ],
    });
    const result = await lookupCardmarketStrategy0(supabase as never, {
      setName: 'NonExistentSet',
      setNumber: '1',
      language: 'fr',
    });
    expect(result).toBeNull();
  });

  it('returns null when expansions list is empty', async () => {
    const supabase = mockSupabase({ expansions: null });
    const result = await lookupCardmarketStrategy0(supabase as never, {
      setName: 'Anything',
      setNumber: '1',
      language: 'fr',
    });
    expect(result).toBeNull();
  });

  it('returns enriched card when both expansion and card_index hit', async () => {
    const supabase = mockSupabase({
      expansions: [
        {
          id_expansion: 4434,
          name: 'Brilliant Stars',
          name_en: 'Brilliant Stars',
          name_ja: null,
        },
      ],
      indexRow: {
        id_product: 608425,
        url_path: '/fr/Pokemon/Products/Singles/Brilliant-Stars/Exeggcute-BRS001',
      },
      product: { id_product: 608425, name: 'Exeggcute' },
    });

    const result = await lookupCardmarketStrategy0(supabase as never, {
      setName: 'Brilliant Stars',
      setNumber: '1',
      language: 'fr',
    });

    expect(result).not.toBeNull();
    expect(result!.cardmarket_id).toBe('608425');
    expect(result!.set_name).toBe('Brilliant Stars');
    expect(result!.set_name_ja).toBeNull();
    expect(result!.tcg_image_url).toContain('608425');
    expect(result!.card_name).toBe('Exeggcute');
  });

  it('matches against name_en when input setName is the EN form', async () => {
    const supabase = mockSupabase({
      expansions: [
        {
          id_expansion: 1521,
          name: 'Vigueur Spectrale',
          name_en: 'Phantom Forces',
          name_ja: null,
        },
      ],
      indexRow: { id_product: 281802, url_path: '/fr/...' },
      product: { id_product: 281802, name: 'Venonat' },
    });

    const result = await lookupCardmarketStrategy0(supabase as never, {
      setName: 'Phantom Forces',
      setNumber: '1',
      language: 'fr',
    });

    expect(result).not.toBeNull();
    expect(result!.cardmarket_id).toBe('281802');
    expect(result!.set_name).toBe('Phantom Forces');
  });

  it('attaches set_name_ja when language is ja and the expansion has it', async () => {
    const supabase = mockSupabase({
      expansions: [
        {
          id_expansion: 5000,
          name: 'Crimson Haze',
          name_en: 'Crimson Haze',
          name_ja: '黒煙の覇者',
        },
      ],
      indexRow: { id_product: 700001, url_path: '/ja/...' },
      product: { id_product: 700001, name: 'Pikachu' },
    });

    const result = await lookupCardmarketStrategy0(supabase as never, {
      setName: 'Crimson Haze',
      setNumber: '5',
      language: 'ja',
    });

    expect(result).not.toBeNull();
    expect(result!.set_name_ja).toBe('黒煙の覇者');
  });

  it('does NOT inject when setName contains PostgREST filter syntax characters', async () => {
    // Adversarial input: would have broken the old .or(`name.eq.${setName},...`)
    // by allowing extra filter clauses. With the in-memory match, this is just
    // a string that legitimately doesn't match any expansion.
    const supabase = mockSupabase({
      expansions: [
        { id_expansion: 1, name: 'Real Set', name_en: 'Real Set', name_ja: null },
      ],
    });
    const result = await lookupCardmarketStrategy0(supabase as never, {
      setName: 'foo,name.neq.bar',
      setNumber: '1',
      language: 'fr',
    });
    expect(result).toBeNull();
  });
});
