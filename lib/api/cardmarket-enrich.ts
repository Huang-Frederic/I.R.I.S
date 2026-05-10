import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// Cardmarket S3 + CloudFront flag direct hotlinks (403). All image URLs we
// surface to the client go through our proxy at /api/cm-img/[id]?prefix=...
// which fetches with browser-like headers and caches at the edge.

export interface CardmarketCard {
  cardmarket_id: string;
  cardmarket_url_path: string;
  /** Pokémon/card name without bracketed attack disambig.
   *  e.g. "Dracaufeu V" not "Dracaufeu V [Wing Attack | Crimson Dive]". */
  card_name: string;
  set_prefix: string;
  set_name: string;
  set_number: string;
  tcg_image_url: string;
}

/**
 * Strip bracketed attack/variant disambig that Cardmarket appends to product
 * names ("Pansage [Collect | Scratch | SV]" → "Pansage"). Prefer card_prefix
 * (already stripped server-side at scrape time) when available.
 */
function displayName(name: string, cardPrefix?: string | null): string {
  const prefix = (cardPrefix ?? '').trim();
  if (prefix) return prefix;
  return name.replace(/\s*\[.*$/, '').trim();
}

/**
 * Build the proxied image URL for a cardmarket product.
 * Goes through /api/cm-img/[id]?prefix=... which fetches with browser headers
 * server-side (avoids CloudFront 403) and caches.
 * Returns "" when set_prefix is null — UI shows no image instead of broken.
 */
function buildImageUrl(setPrefix: string | null, idProduct: number): string {
  if (!setPrefix) return '';
  return `/api/cm-img/${idProduct}?prefix=${encodeURIComponent(setPrefix)}`;
}

interface ExpansionRow {
  id_expansion: number;
  name: string;
  name_en: string | null;
  set_prefix: string | null;
}

/**
 * Resolve set_prefix → expansion row(s). Multiple expansions can share the
 * same prefix in theory (none observed yet); we return all matches and let
 * the caller deal with it.
 */
async function resolveExpansionsByPrefix(
  supabase: SupabaseClient,
  setPrefix: string,
): Promise<ExpansionRow[]> {
  const { data } = await supabase
    .from('cardmarket_expansions')
    .select('id_expansion, name, name_en, set_prefix')
    .ilike('set_prefix', setPrefix)
    .limit(10);
  return (data ?? []) as ExpansionRow[];
}

interface CardIndexRow {
  id_product: number;
  id_expansion: number;
  set_number: string;
  url_path: string | null;
  url_variant: string | null;
}

interface ProductRow {
  id_product: number;
  name: string;
  card_prefix: string | null;
  card_prefix_normalized: string | null;
  id_expansion: number;
}

function normalize(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '');
}

/**
 * Strategy 0 — direct lookup by (set_prefix + set_number).
 *
 * Both fields must be non-null. For Trainer Gallery / subseries cards the
 * caller will have set_number=null (per the prompt contract) and should call
 * lookupBySetPrefixAndName instead.
 *
 * Returns:
 *   - 1 card → unique match, return it.
 *   - 0 cards → null, caller falls through.
 *   - >1 cards → all of them (e.g. reverse holo variants of the same number).
 *     Caller exposes as picker.
 */
export async function lookupBySetPrefixAndNumber(
  supabase: SupabaseClient,
  setPrefix: string,
  setNumber: string,
): Promise<CardmarketCard[]> {
  if (!setPrefix || !setNumber) return [];
  const expansions = await resolveExpansionsByPrefix(supabase, setPrefix);
  if (expansions.length === 0) return [];

  const expansionIds = expansions.map((e) => e.id_expansion);
  const { data: indexRows } = await supabase
    .from('cardmarket_card_index')
    .select('id_product, id_expansion, set_number, url_path, url_variant')
    .in('id_expansion', expansionIds)
    .eq('set_number', setNumber)
    .limit(20);

  const idx = (indexRows ?? []) as CardIndexRow[];
  if (idx.length === 0) return [];

  const idProducts = idx.map((r) => r.id_product);
  const { data: products } = await supabase
    .from('cardmarket_products')
    .select('id_product, name, card_prefix, card_prefix_normalized, id_expansion')
    .in('id_product', idProducts);
  const prods = (products ?? []) as ProductRow[];

  const productById = new Map<number, ProductRow>();
  for (const p of prods) productById.set(p.id_product, p);
  const expansionById = new Map<number, ExpansionRow>();
  for (const e of expansions) expansionById.set(e.id_expansion, e);

  return idx
    .map((r) => buildCard(r, productById.get(r.id_product), expansionById.get(r.id_expansion)))
    .filter((c): c is CardmarketCard => c !== null);
}

/**
 * Strategy 1 — picker lookup by (set_prefix + pokemon_name).
 *
 * Used when set_number is null/unreliable (TG/GG cards, illegible numbers).
 * Returns up to 10 candidates from the expansion(s) matching the prefix
 * whose card_prefix_normalized contains the OCR pokemon name. Substring match
 * works in both directions to handle suffixes ("Charizard V" matches "Charizard"
 * and vice-versa).
 */
export async function lookupBySetPrefixAndName(
  supabase: SupabaseClient,
  setPrefix: string,
  pokemonName: string,
): Promise<CardmarketCard[]> {
  if (!setPrefix || !pokemonName) return [];
  const expansions = await resolveExpansionsByPrefix(supabase, setPrefix);
  if (expansions.length === 0) return [];

  const expansionIds = expansions.map((e) => e.id_expansion);
  const target = normalize(pokemonName);
  // Sanitize for ILIKE (% and _ are SQL wildcards). Pokémon names from the
  // static dex map don't contain these, but defense-in-depth.
  const targetSafe = target.replace(/[%_]/g, '');

  // Filter at the SQL level — pulling all products of an expansion and
  // filtering client-side hits a 500-row cap on big sets like LOR (~400+
  // products with variants) and silently misses cards past the limit.
  const { data: products } = await supabase
    .from('cardmarket_products')
    .select('id_product, name, card_prefix, card_prefix_normalized, id_expansion')
    .in('id_expansion', expansionIds)
    .ilike('card_prefix_normalized', `%${targetSafe}%`)
    .limit(50);
  const prods = (products ?? []) as ProductRow[];
  if (prods.length === 0) return [];

  // Final client-side check: also accept the inverse substring direction
  // (e.g. OCR pokemon "Charizard V" vs cardmarket "Charizard"). The SQL
  // ilike already caught the common case (target ⊂ candidate); this catches
  // the reverse.
  const matched = prods.filter((p) => {
    const candidate = p.card_prefix_normalized || normalize(p.card_prefix || p.name);
    if (!candidate) return false;
    return candidate.includes(target) || target.includes(candidate);
  });
  if (matched.length === 0) return [];

  const idProducts = matched.map((p) => p.id_product);
  const { data: indexRows } = await supabase
    .from('cardmarket_card_index')
    .select('id_product, id_expansion, set_number, url_path, url_variant')
    .in('id_product', idProducts)
    .limit(50);
  const idx = (indexRows ?? []) as CardIndexRow[];

  const productById = new Map<number, ProductRow>();
  for (const p of matched) productById.set(p.id_product, p);
  const expansionById = new Map<number, ExpansionRow>();
  for (const e of expansions) expansionById.set(e.id_expansion, e);

  // Build cards from matched products. Prefer card_index entries (have
  // set_number + url_path + variant), but fall back to a synthesized index
  // row when the card isn't in our scraped index — this happens when the
  // BrightData scrape missed cards on later pages of big sets (e.g. LOR
  // Trainer Gallery cards). Better to return the card with cardmarket_id +
  // image URL and a blank set_number than to silently drop it.
  const indexByProduct = new Map<number, CardIndexRow>();
  for (const r of idx) indexByProduct.set(r.id_product, r);

  const cards: CardmarketCard[] = [];
  for (const p of matched) {
    const idxRow = indexByProduct.get(p.id_product) ?? {
      id_product: p.id_product,
      id_expansion: p.id_expansion,
      set_number: '',
      url_path: null,
      url_variant: null,
    };
    const card = buildCard(idxRow, p, expansionById.get(p.id_expansion));
    if (card) cards.push(card);
    if (cards.length >= 10) break;
  }
  return cards;
}

function buildCard(
  index: CardIndexRow,
  product: ProductRow | undefined,
  expansion: ExpansionRow | undefined,
): CardmarketCard | null {
  if (!product || !expansion) return null;
  const setPrefix = expansion.set_prefix ?? '';
  return {
    cardmarket_id: String(index.id_product),
    cardmarket_url_path: index.url_path ?? '',
    card_name: displayName(product.name, product.card_prefix),
    set_prefix: setPrefix,
    set_name: expansion.name_en ?? expansion.name,
    set_number: index.set_number,
    tcg_image_url: buildImageUrl(setPrefix || null, index.id_product),
  };
}
