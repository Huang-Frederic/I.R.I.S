// lib/api/tcg-catalog.ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CardLanguage, EnrichedCard } from '@/lib/types';

/**
 * Strip leading zeros from an OCR-extracted set number ("012" → "12").
 * Catalog stores plain digits without padding; OCR commonly returns the
 * card's printed form which IS padded. Returns the original string when
 * non-numeric (defensive — current data has no alphanumerics, but future
 * cards like "TG01" should pass through unchanged).
 */
export function normalizeSetNumber(setNumber: string): string {
  if (!/^\d+$/.test(setNumber)) return setNumber;
  return setNumber.replace(/^0+/, '') || '0';
}

/**
 * Normalize a set_code by stripping non-alphanumerics and lowercasing.
 * Catalog stores "smp"/"xyp" but OCR may return "SM-P"/"XY-P"/"SV11W".
 * Treats them as equivalent.
 */
export function normalizeSetCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

/** Database row shape — matches the tcg_catalog table 1:1. */
export interface CatalogRow {
  id: string;
  cardmarket_id: string;
  set_code: string;
  set_number: string;
  set_total: number | null;
  language: CardLanguage;
  card_name: string;
  pokemon_name: string | null;
  pokemon_number: number | null;
  set_name: string;
  rarity: string | null;
  image_url: string | null;
  scraped_at: string;
}

/**
 * Map a catalog row into the EnrichedCard shape the scan form prefills from.
 * The card_id_tcg synthetic field is "{SET}-{NUMBER}" — keeps continuity
 * with the previous TCGdex-based ID format the rest of the codebase expects.
 */
export function rowToEnrichedCard(row: CatalogRow): EnrichedCard {
  const setNumber = row.set_total != null ? `${row.set_number}/${row.set_total}` : row.set_number;
  return {
    card_id_tcg: `${row.set_code}-${row.set_number}`,
    card_name: row.card_name,
    pokemon_name: row.pokemon_name ?? row.card_name,
    pokemon_number: row.pokemon_number,
    set_name: row.set_name,
    set_code: row.set_code,
    set_number: setNumber,
    rarity: (row.rarity as EnrichedCard['rarity']) ?? 'OTHER',
    tcg_image_url: row.image_url ?? '',
    cardmarket_id: row.cardmarket_id,
    cm_price_low: null,
    cm_price_trend: null,
    cm_price_avg: null,
  };
}

/**
 * Direct lookup by (set_code, set_number, language). The fast path —
 * hits the unique index, returns 0 or 1 rows.
 *
 * Now uses normalized set_code comparison (strip dashes, lowercase) to handle
 * OCR variants like "SM-P" vs "smp", "XY-P" vs "xyp".
 */
export async function lookupByCode(
  supabase: SupabaseClient,
  setCode: string,
  setNumber: string,
  language: CardLanguage,
): Promise<CatalogRow | null> {
  const normCode = normalizeSetCode(setCode);
  const normNum = normalizeSetNumber(setNumber);

  // Fetch all matching number+language, then filter by normalized set_code in JS.
  // This pulls ~5-20 rows max (set_number + language is narrow), filters in JS.
  // Fast enough and handles SM-P/smp, XY-P/xyp, sv11W/sv11w variants.
  const { data, error } = await supabase
    .from('tcg_catalog')
    .select('*')
    .eq('set_number', normNum)
    .eq('language', language);
  if (error) throw new Error(`tcg_catalog lookupByCode: ${error.message}`);

  const filtered = (data as CatalogRow[])?.filter(
    (r) => normalizeSetCode(r.set_code) === normCode,
  );
  return filtered?.[0] ?? null;
}

/**
 * Fallback lookup when set_code OCR was unreliable: find every row matching
 * the printed denominator + localId in the requested language. Same idea as
 * the TCGdex `findCardsByTotalAndLocalId` — handles JP cards where the
 * printed total doesn't match the official cardCount.
 */
export async function lookupByTotal(
  supabase: SupabaseClient,
  setTotal: number,
  setNumber: string,
  language: CardLanguage,
): Promise<CatalogRow[]> {
  const normNum = normalizeSetNumber(setNumber);
  // Combined strict + loose: any set whose listed total is at least the printed
  // denominator. Catches both exact matches (set_total = setTotal) and JP cases
  // where the listed total is inflated by secret rares (e.g. S4a printed 190
  // but listed 326). Sorted ascending so disambiguation considers tighter
  // matches first.
  const { data, error } = await supabase
    .from('tcg_catalog')
    .select('*')
    .eq('set_number', normNum)
    .eq('language', language)
    .gte('set_total', setTotal)
    .order('set_total', { ascending: true })
    .limit(30);
  if (error) throw new Error(`tcg_catalog lookupByTotal: ${error.message}`);
  return (data as CatalogRow[]) ?? [];
}

/**
 * Narrow a candidate list using the OCR text (which contains the Pokémon
 * name). Same 3-way logic as the TCGdex disambiguator:
 *   - 1 name match → auto-select
 *   - >1 name matches → return only those (picker shows them)
 *   - 0 name matches → return null (fall through to next strategy)
 */
export function disambiguateByName(
  cards: CatalogRow[],
  ocrText: string,
): { best: CatalogRow | null; candidates: CatalogRow[] } {
  if (cards.length === 0) return { best: null, candidates: [] };

  // Cardmarket's card_name often includes suffixes (Charizard ex, Pikachu V)
  // that the OCR may not capture verbatim. Fall back to pokemon_name (the
  // bare species name) as a secondary signal.
  const matches = cards.filter(
    (c) =>
      ocrText.includes(c.card_name) ||
      (c.pokemon_name !== null && ocrText.includes(c.pokemon_name)),
  );
  if (matches.length === 1) return { best: matches[0], candidates: [matches[0]] };
  if (matches.length > 1) return { best: matches[0], candidates: matches };
  // Zero name matches — none of the candidates are plausibly the right card.
  // Return null so the caller can fall through to the next strategy (e.g.
  // TCGdex live). Previous behaviour picked cards[0] arbitrarily, which
  // surfaced the wrong card to the user.
  return { best: null, candidates: cards };
}
