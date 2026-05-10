import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EnrichedCard, EnrichResult, CardLanguage } from '@/lib/types';
import { rowToEnrichedCard, type CatalogRow } from './tcg-catalog';

interface VerifyContext {
  supabase: SupabaseClient;
  ocrIllustrator: string | null | undefined;
  ocrPokemonName: string | null | undefined;
  ocrSetNumber: string | null | undefined;
  ocrLanguage: CardLanguage;
}

function normalize(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim();
}

/**
 * Strip the trailing "/total" if present and remove leading zeros from the
 * digits portion. "TG003/30" → "TG3"; "001" → "1". Used for catalog lookup.
 */
function normalizeSetNumber(raw: string): string {
  if (!raw) return raw;
  const noTotal = raw.split('/')[0];
  const m = noTotal.match(/^([^\d]*)(\d+)$/);
  if (!m) return noTotal;
  const [, prefix, digits] = m;
  return `${prefix}${parseInt(digits, 10)}`;
}

/** Build the set of plausible set_number variants for catalog lookup. */
function setNumberVariants(raw: string): string[] {
  const noTotal = raw.split('/')[0].trim();
  const variants = new Set<string>([noTotal]);
  variants.add(normalizeSetNumber(noTotal));
  const digitsMatch = noTotal.match(/(\d+)/);
  if (digitsMatch) {
    variants.add(String(parseInt(digitsMatch[1], 10)));
  }
  return Array.from(variants);
}

/**
 * Cross-validate the enrich result. Detects two failure modes from upstream
 * strategies:
 *
 *   1. **Gross mismatch** — matched.pokemon_name doesn't agree with the OCR
 *      pokemon name (e.g. Strategy 0 returned "Pansage" via a hallucinated
 *      Gemini set_name when OCR clearly said "Reshiram"). Always cross-search.
 *
 *   2. **Set ambiguity** — pokemon names agree but the catalog illustrator
 *      either contradicts the OCR illustrator or is missing while OCR has one.
 *      Suggests the same Pokémon exists in multiple sets and the upstream
 *      picked the wrong one (e.g. BRS-TG3 vs LOR-TG3 Dracaufeu).
 *
 * Cross-search runs in two stores:
 *   - `tcg_catalog` (has illustrator data — high precision when populated)
 *   - `cardmarket_card_index` (fallback — matches via card_prefix_normalized
 *     when catalog has gaps, particularly for JP entries)
 */
export async function verifyByIllustrator(
  ctx: VerifyContext,
  result: EnrichResult,
): Promise<EnrichResult> {
  const matched = result.bestMatch;
  if (!matched) return result;
  if (!ctx.ocrPokemonName || !ctx.ocrSetNumber) return result;

  const ocrPokemonNorm = normalize(ctx.ocrPokemonName);
  const matchedPokemonNorm = normalize(matched.pokemon_name);
  const matchedCardNameNorm = normalize(matched.card_name);
  const grossMismatch =
    !matchedPokemonNorm.includes(ocrPokemonNorm) &&
    !ocrPokemonNorm.includes(matchedPokemonNorm) &&
    !matchedCardNameNorm.includes(ocrPokemonNorm);

  if (!grossMismatch) {
    // Pokemon agrees. We only need to verify if OCR provided an illustrator
    // (otherwise no signal to cross-check with).
    if (!ctx.ocrIllustrator) return result;

    const matchedIllustrator = await fetchCatalogIllustrator(
      ctx.supabase,
      matched.set_code,
      ctx.ocrSetNumber,
      ctx.ocrLanguage,
    );
    // Positive confirmation: catalog has illustrator AND it matches OCR.
    if (
      matchedIllustrator &&
      normalize(matchedIllustrator) === normalize(ctx.ocrIllustrator)
    ) {
      return result;
    }
    // Either the catalog disagrees, or the catalog has no illustrator data
    // for the matched card. In both cases we have an OCR illustrator that
    // can disambiguate — proceed to cross-search.
  }

  // 1. Try tcg_catalog (high precision via illustrator).
  let alternatives = await findCatalogAlternatives(ctx, /*useIllustrator*/ true);

  // 2. If illustrator filter gave nothing, retry catalog without it.
  if (alternatives.length === 0 && ctx.ocrIllustrator) {
    alternatives = await findCatalogAlternatives(ctx, /*useIllustrator*/ false);
  }

  // 3. If catalog still empty, try cardmarket_card_index (covers JP gaps).
  if (alternatives.length === 0) {
    const cmAlts = await findCardmarketAlternatives(ctx);
    if (cmAlts.length > 0) {
      if (cmAlts.length === 1) {
        return { bestMatch: cmAlts[0], candidates: cmAlts };
      }
      return { bestMatch: cmAlts[0], candidates: cmAlts };
    }
  }

  if (alternatives.length === 0) return result;

  if (alternatives.length === 1) {
    const corrected = rowToEnrichedCard(alternatives[0]);
    return { bestMatch: corrected, candidates: [corrected] };
  }

  const candidates = alternatives.map(rowToEnrichedCard);
  return { bestMatch: candidates[0], candidates };
}

/**
 * Fetch the illustrator for the matched card, trying multiple set_number
 * variants (the catalog stores TG cards inconsistently — sometimes "TG3",
 * sometimes "TG03", sometimes bare "3").
 */
async function fetchCatalogIllustrator(
  supabase: SupabaseClient,
  setCode: string,
  setNumber: string,
  language: CardLanguage,
): Promise<string | null> {
  if (!setCode || !setNumber) return null;
  const variants = setNumberVariants(setNumber);
  const { data } = await supabase
    .from('tcg_catalog')
    .select('illustrator')
    .ilike('set_code', setCode)
    .in('set_number', variants)
    .eq('language', language)
    .limit(1)
    .maybeSingle();
  return (data?.illustrator as string | null) ?? null;
}

/**
 * Search tcg_catalog across ALL sets for cards matching (set_number variants,
 * language, pokemon_name). When useIllustrator=true and OCR has illustrator,
 * applies a strict illustrator filter (high precision). When false, falls back
 * to pokemon-name-only matching (catches catalog gaps on illustrator).
 */
async function findCatalogAlternatives(
  ctx: VerifyContext,
  useIllustrator: boolean,
): Promise<CatalogRow[]> {
  const ocrPokemonNorm = normalize(ctx.ocrPokemonName!);
  const ocrIllustratorNorm =
    useIllustrator && ctx.ocrIllustrator ? normalize(ctx.ocrIllustrator) : null;

  const numberVariants = setNumberVariants(ctx.ocrSetNumber!);

  const { data: rows } = await ctx.supabase
    .from('tcg_catalog')
    .select('*')
    .in('set_number', numberVariants)
    .eq('language', ctx.ocrLanguage)
    .limit(200);

  if (!rows) return [];

  const matches: CatalogRow[] = [];
  for (const row of rows as CatalogRow[]) {
    if (!row.pokemon_name) continue;
    const pkmNorm = normalize(row.pokemon_name);
    if (!pkmNorm.includes(ocrPokemonNorm) && !ocrPokemonNorm.includes(pkmNorm)) {
      continue;
    }
    if (ocrIllustratorNorm) {
      if (!row.illustrator) continue;
      if (normalize(row.illustrator) !== ocrIllustratorNorm) continue;
    }
    matches.push(row);
    if (matches.length >= 5) break;
  }
  return matches;
}

/**
 * Cardmarket fallback: search cardmarket_card_index + cardmarket_products for
 * (set_number variants, card_prefix_normalized~pokemon_name), then resolve
 * each candidate back through tcg_catalog by cardmarket_id to get rich card
 * data (set_code, illustrator, image_url). Used when the catalog-only path
 * returns nothing — typically because the upstream strategy matched a wrong
 * cardmarket product whose tcg_catalog twin is fine.
 */
async function findCardmarketAlternatives(
  ctx: VerifyContext,
): Promise<EnrichedCard[]> {
  const ocrPokemonNorm = normalize(ctx.ocrPokemonName!);
  const numberVariants = setNumberVariants(ctx.ocrSetNumber!);

  const { data: indexRows } = await ctx.supabase
    .from('cardmarket_card_index')
    .select('id_product')
    .in('set_number', numberVariants)
    .limit(500);

  if (!indexRows || indexRows.length === 0) return [];

  const idProducts = (indexRows as Array<{ id_product: number }>).map((r) => r.id_product);

  const { data: products } = await ctx.supabase
    .from('cardmarket_products')
    .select('id_product, name, card_prefix_normalized')
    .in('id_product', idProducts);

  if (!products) return [];

  const matchedProductIds: string[] = [];
  for (const p of products as Array<{
    id_product: number;
    name: string;
    card_prefix_normalized: string;
  }>) {
    const prefixNorm = p.card_prefix_normalized || normalize(p.name);
    if (!prefixNorm.includes(ocrPokemonNorm) && !ocrPokemonNorm.includes(prefixNorm)) {
      continue;
    }
    matchedProductIds.push(String(p.id_product));
    if (matchedProductIds.length >= 10) break;
  }

  if (matchedProductIds.length === 0) return [];

  // Resolve product ids back to tcg_catalog rows for full card data.
  const { data: catalogRows } = await ctx.supabase
    .from('tcg_catalog')
    .select('*')
    .in('cardmarket_id', matchedProductIds)
    .eq('language', ctx.ocrLanguage)
    .limit(10);

  if (!catalogRows || catalogRows.length === 0) return [];

  const ocrIllustratorNorm = ctx.ocrIllustrator ? normalize(ctx.ocrIllustrator) : null;
  const rows = catalogRows as CatalogRow[];

  // Prefer rows whose illustrator agrees with OCR (when OCR has one).
  if (ocrIllustratorNorm) {
    const filtered = rows.filter(
      (r) => r.illustrator && normalize(r.illustrator) === ocrIllustratorNorm,
    );
    if (filtered.length > 0) {
      return filtered.slice(0, 5).map(rowToEnrichedCard);
    }
  }
  return rows.slice(0, 5).map(rowToEnrichedCard);
}
