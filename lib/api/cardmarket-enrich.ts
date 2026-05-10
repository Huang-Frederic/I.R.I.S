import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

const CM_IMG_BASE = 'https://product-images.s3.cardmarket.com/51';

export interface CardmarketLookupInput {
  setName: string;
  setNumber: string;
  language: string;
}

export interface CardmarketLookupResult {
  cardmarket_id: string;
  cardmarket_url_path: string;
  card_name: string;
  set_name: string;
  set_name_ja: string | null;
  tcg_image_url: string;
}

/**
 * Strategy 0 of the enrich pipeline: resolve a card identity entirely from
 * our local Cardmarket-derived tables (no network).
 *
 * Steps:
 *   1. Resolve set_name (any locale) → id_expansion via cardmarket_expansions
 *      (matches against name, name_en, or name_ja).
 *   2. Lookup (id_expansion, set_number) in cardmarket_card_index → id_product.
 *   3. Fetch the product display name from cardmarket_products.
 *   4. Build the canonical S3 image URL from the cardmarket image pattern.
 *
 * Returns null on any miss — caller falls back to TCGdex strategies.
 */
export async function lookupCardmarketStrategy0(
  supabase: SupabaseClient,
  input: CardmarketLookupInput,
): Promise<CardmarketLookupResult | null> {
  const { setName, setNumber, language } = input;
  if (!setName || !setNumber) return null;

  // Step 1: resolve the expansion via in-memory match against name/name_en/name_ja.
  // We pull the full list (~741 rows, ~50 KB) and filter client-side instead of
  // using PostgREST's `.or()` clause, which is vulnerable to filter-injection
  // when the value contains commas/periods/quotes (cf. Supabase discussions
  // around .or() escaping). The set is small and read-mostly, so the round-trip
  // overhead is negligible.
  const { data: allExpansions } = await supabase
    .from('cardmarket_expansions')
    .select('id_expansion, name, name_en, name_ja');

  if (!allExpansions) return null;
  const expansion = (
    allExpansions as Array<{
      id_expansion: number;
      name: string | null;
      name_en: string | null;
      name_ja: string | null;
    }>
  ).find(
    (e) => e.name === setName || e.name_en === setName || e.name_ja === setName,
  );

  if (!expansion) return null;
  const idExpansion: number = expansion.id_expansion;
  const setNameEn: string | null = expansion.name_en ?? expansion.name ?? null;
  const setNameJa: string | null = expansion.name_ja ?? null;

  // Step 2: lookup the index row.
  const { data: indexRow } = await supabase
    .from('cardmarket_card_index')
    .select('id_product, url_path')
    .eq('id_expansion', idExpansion)
    .eq('set_number', setNumber)
    .single();

  if (!indexRow) return null;
  const idProduct: number = indexRow.id_product;
  const urlPath: string = indexRow.url_path ?? '';

  // Step 3: fetch the product name + card_prefix (needed for image URL).
  const { data: product } = await supabase
    .from('cardmarket_products')
    .select('id_product, name, card_prefix')
    .eq('id_product', idProduct)
    .single();

  const cardName: string = product?.name ?? '';
  const cardPrefix: string = product?.card_prefix ?? '';

  // Step 4: build the canonical S3 image URL.
  // Pattern: https://product-images.s3.cardmarket.com/51/{set_prefix}/{idProduct}/{idProduct}.jpg
  // The set_prefix (e.g. "BRS", "PHF") is REQUIRED — flat path without prefix
  // returns 403. If we somehow lack the prefix, fall back to flat path which
  // at least resolves correctly for the small minority of products without
  // a card_prefix entry in cardmarket_products.
  const imageUrl = cardPrefix
    ? `${CM_IMG_BASE}/${cardPrefix}/${idProduct}/${idProduct}.jpg`
    : `${CM_IMG_BASE}/${idProduct}/${idProduct}.jpg`;

  return {
    cardmarket_id: String(idProduct),
    cardmarket_url_path: urlPath,
    card_name: cardName,
    set_name: setNameEn ?? '',
    set_name_ja: language.toLowerCase() === 'ja' ? setNameJa : null,
    tcg_image_url: imageUrl,
  };
}
