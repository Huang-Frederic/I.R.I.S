// lib/api/cardmarket-pricing.ts
//
// Local Cardmarket pricing lookup. Replaces the live TCGdex calls in the
// daily pricing cron — same end fields written to the cards table
// (cm_price_low / trend / avg + cardmarket_id), but resolved from the
// Cardmarket data dumps mirrored in our `cardmarket_*` Supabase tables.
//
// Flow:
//   card.set_name + lang  → cardmarket_expansions  → idExpansion
//   pokemon_name + suffix → cardmarket_products    → idProduct
//   variant + rarity      → cardmarket_pricing     → low/trend/avg
//
// See scripts/upload-cardmarket-dumps.ts for the data load.

import type { createServiceClient } from '@/lib/supabase/service';
import type { Card } from '@/lib/types';
import { POKEMON_NAMES } from '@/lib/data/pokemon-names';
import { localizedSetName } from './tcgdex-set-mapping';

type ServiceClient = ReturnType<typeof createServiceClient>;

export type LookupOutcome =
  | {
      ok: true;
      idProduct: number;
      low: number | null;
      trend: number | null;
      avg: number | null;
      source: 'regular' | 'holo';
      ambiguous: boolean;
      /** Cardmarket URL path of the picked product, e.g. "/fr/Pokemon/Products/...".
       *  Null when not yet scraped (FAST PATH miss, fallback hit). */
      urlPath: string | null;
    }
  | {
      ok: false;
      reason: 'no_expansion' | 'no_product' | 'no_pricing' | 'unsupported_variant' | 'missing_set_name';
      /** Free-form context string for telemetry — what was actually tried. */
      details?: string;
    };

/** Variants that have no Cardmarket equivalent — JP-exclusive promo prints
 *  (Poké Ball, Master Ball, dot/stamp variants) or generic "Promo" placeholder.
 *  These keep their manual prices. */
const UNSUPPORTED_VARIANTS = new Set(['pokeball', 'masterball', 'stamp', 'promo']);

/** Decode the HTML entities that occasionally leak into stored set/card
 *  names from upstream sources ("Scarlet &amp; Violet Promos" → "Scarlet
 *  & Violet Promos"). Lookup must compare on the decoded form. */
export function htmlDecode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Lowercased + accent-stripped + HTML-decoded, matches the upload script. */
export function normalize(s: string): string {
  return htmlDecode(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Token-sorted normalized form. Used to bridge word-order differences
 *  between localized set names ("Festival Terastal ex" ↔ "Terastal Festival ex"
 *  share the same tokens). False positives are rare since matching tokens
 *  also implies semantic overlap. */
export function tokensSorted(s: string): string {
  return normalize(s).split(/\s+/).filter(Boolean).sort().join(' ');
}

/** Game-name prefixes the user's stored set_name might carry that the
 *  Cardmarket dropdown omits. "Pokémon 151" → "151" handles SV03.5 FR. */
const GAME_PREFIX_RE = /^pok[eé]mon(\s+card|\s+tcg)?\s+/i;

/** Suffix detector matching the convention used by deriveCardNameFr in
 *  tcg-catalog.ts. Cardmarket appends the suffix to the Pokémon name in the
 *  product prefix ("Iron Crown ex [Cobalt Command | ...]"). */
const SUFFIX_RE = /[\s-]*(ex|EX|GX|V|VMAX|VSTAR|V-?UNION|BREAK|LEGEND)\s*$/i;

/** Cardmarket never uses dashes in product names ("Mewtwo EX" not "Mewtwo-EX",
 *  "Slurpuff ex" not "Sucreine-ex"). Replace " -EX" / "-ex" with " EX" / " ex". */
function normalizeSuffixDash(s: string): string {
  return s.replace(/-(ex|EX|GX|V|VMAX|VSTAR|V-?UNION|BREAK|LEGEND)\b/gi, ' $1');
}

/**
 * Best-effort English card name (matches Cardmarket's product prefix).
 *
 * - EN cards: card_name is already English → use as-is.
 * - FR cards: card_name is French ("Couronne de Fer ex") → take pokemon_name
 *   (always English in the catalog, e.g. "Iron Crown") + the suffix sniffed
 *   from card_name → "Iron Crown ex". Falls back to the English name from
 *   pokemon_number when pokemon_name itself is localized (Gemini-only path).
 * - JP/KO/CN cards: same as FR.
 * - Trainers (pokemon_name === null && pokemon_number === null): we can't
 *   reconstruct, use card_name as-is.
 */
export function buildSearchPrefixes(card: Card): string[] {
  const prefixes: string[] = [];
  const cardName = (card.card_name ?? '').trim();
  const pokemonName = (card.pokemon_name ?? '').trim();

  // 1. card_name as-is (covers EN cards trivially; FR cards may match if names
  //    happen to be cognates like "Pikachu", "Charizard").
  if (cardName) prefixes.push(cardName);

  // 2. card_name with the parenthesized "(Original)" stripped — handles
  //    "Gruikui (Iron Crown)" by trying both "Gruikui" and "Iron Crown".
  const parenMatch = cardName.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    prefixes.push(parenMatch[1].trim());
    prefixes.push(parenMatch[2].trim());
  }

  // Suffix from card_name, e.g. " ex" / " EX" / " VMAX". Used in (3) and (4).
  // Try in order: paren-stripped form first ("Aquali-ex" out of "Aquali-ex
  // (シャワーズex)"), then raw card_name. The raw form misses suffixes when
  // the card_name ends with a parenthesis ("...ex)").
  const suffixSource = parenMatch ? parenMatch[1].trim() : cardName;
  const suffixMatch = suffixSource.match(SUFFIX_RE) ?? cardName.match(SUFFIX_RE);
  const suffix = suffixMatch ? ` ${suffixMatch[1]}` : '';

  // 3. Reconstructed English name = catalog pokemon_name + suffix.
  if (pokemonName) {
    prefixes.push(`${pokemonName}${suffix}`);
    if (suffix) prefixes.push(pokemonName);
  }

  // 4. Same trick but using POKEMON_NAMES[pokemon_number].en — this is the
  //    safety net when pokemon_name is itself localized (e.g. "Reptincel"
  //    when Gemini fell back without catalog match). pokemon_number is the
  //    canonical national-dex number which we trust regardless of language.
  if (card.pokemon_number != null) {
    const entry = POKEMON_NAMES[card.pokemon_number];
    if (entry?.en) {
      prefixes.push(`${entry.en}${suffix}`);
      if (suffix) prefixes.push(entry.en);
    }
  }

  // 5. Dedupe + dash-normalize (Cardmarket has no dashes: "Slowbro EX" not
  //    "Slowbro-EX"). Generate dash-normalized variants alongside the originals
  //    so a stored "Slowbro-EX" matches a CM "Slowbro EX" entry.
  const expanded: string[] = [];
  for (const p of prefixes) {
    const trimmed = p.trim();
    if (!trimmed) continue;
    expanded.push(trimmed);
    const dashFixed = normalizeSuffixDash(trimmed);
    if (dashFixed !== trimmed) expanded.push(dashFixed);
  }
  return Array.from(new Set(expanded));
}

/**
 * Choose the right pricing fields for the card's variant. Modern sets have
 * separate idProducts for regular vs reverse-holo; older sets keep a single
 * idProduct with both regular fields and *-holo fields populated.
 */
function pickPricingFields(
  pricing: { low: number | null; trend: number | null; avg: number | null; low_holo: number | null; trend_holo: number | null; avg_holo: number | null },
  variant: string | null,
): { low: number | null; trend: number | null; avg: number | null; source: 'regular' | 'holo' } {
  const isReverseHolo = variant === 'reverse_holo';
  const holoAvailable = pricing.avg_holo != null || pricing.trend_holo != null || pricing.low_holo != null;
  if (isReverseHolo && holoAvailable) {
    return { low: pricing.low_holo, trend: pricing.trend_holo, avg: pricing.avg_holo, source: 'holo' };
  }
  return { low: pricing.low, trend: pricing.trend, avg: pricing.avg, source: 'regular' };
}

/**
 * Premium-tier rarities — alternate-art / full-art / character-art prints that
 * are MORE expensive than the regular base print of the same card. When a
 * card name appears with multiple idProducts in the same expansion, these
 * pick the highest-priced one.
 *
 * Note RR is NOT in this set: RR (Double Rare) is the BASE modern ex/V print,
 * cheaper than its AR/SAR/SR (full art) siblings of the same card. A user
 * with `rarity='RR'` wants the regular EX/ex print, not the FA. Same for
 * CHR/R_HOLO — those are the base "rare" tiers that get an AR/SAR sibling.
 */
const PREMIUM_TIERS: ReadonlySet<string> = new Set([
  'SAR', // Special Art Rare — the rarest cosmetic variant
  'AR',  // Art Rare         — alternate art
  'SR',  // Super Rare       — full art / gold
]);

/**
 * When several products share the same prefix in the same expansion, pick by
 * (variant + rarity):
 *   - reverse_holo OR rarity ∈ premium-tier → highest avg
 *   - everything else (RR base prints, Commons, etc.) → lowest avg
 */
export function pickAmbiguousIndex(
  pricings: Array<{ avg: number | null }>,
  variant: string | null,
  rarity: string | null,
): number {
  const wantHighest =
    variant === 'reverse_holo' || (rarity !== null && PREMIUM_TIERS.has(rarity));
  let bestIdx = 0;
  let bestVal = pricings[0]?.avg ?? (wantHighest ? -1 : Number.POSITIVE_INFINITY);
  for (let i = 1; i < pricings.length; i += 1) {
    const cur = pricings[i].avg ?? (wantHighest ? -1 : Number.POSITIVE_INFINITY);
    if (wantHighest ? cur > bestVal : cur < bestVal) {
      bestVal = cur;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * In-memory cache of all 741 expansions. Loaded once per process on first
 * lookup. Both an exact-name index and a token-sorted index are built so
 * we can fall back to fuzzy matching (handles word-reordered localizations
 * like FR "Festival Terastal ex" vs the canonical "Terastal Festival ex").
 */
interface ExpansionIndex {
  byNameNorm: Map<string, number[]>;
  byTokens: Map<string, number[]>;
}
let expansionsCache: ExpansionIndex | null = null;

async function loadExpansions(service: ServiceClient): Promise<ExpansionIndex> {
  if (expansionsCache) return expansionsCache;
  const { data, error } = await service
    .from('cardmarket_expansions')
    .select('id_expansion, name, name_normalized');
  if (error) throw new Error(`cardmarket_expansions load: ${error.message}`);
  const idx: ExpansionIndex = { byNameNorm: new Map(), byTokens: new Map() };
  for (const row of (data ?? []) as Array<{ id_expansion: number; name: string; name_normalized: string }>) {
    pushIntoMap(idx.byNameNorm, row.name_normalized, row.id_expansion);
    pushIntoMap(idx.byTokens, tokensSorted(row.name), row.id_expansion);
  }
  expansionsCache = idx;
  return idx;
}

function pushIntoMap<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const list = m.get(k) ?? [];
  list.push(v);
  m.set(k, list);
}

/** Test-only: clear the in-memory cache so tests start with a clean slate. */
export function _resetExpansionsCacheForTests(): void {
  expansionsCache = null;
}

/**
 * Produce the set-name spellings to try against cardmarket_expansions.
 *
 *   1. Raw card.set_name + the two halves of the bilingual "Translation
 *      (Original)" wrap if present.
 *   2. Same but with the "Pokémon /Pokémon Card /Pokémon TCG " prefix
 *      stripped — the dropdown lists "151" not "Pokémon 151".
 *   3. Every distinct set_name from tcg_catalog for (set_code, set_number)
 *      across all languages — LimitlessTCG often holds the canonical EN
 *      translation that Cardmarket also uses.
 *   4. TCGdex-bridged localized name for FR/DE/IT/ES — covers the case where
 *      our DB has the EN set_name but Cardmarket's locale uses a translated
 *      entry ("Twilight Masquerade" → "Mascarade Crépusculaire").
 */
async function buildCandidateSetNames(
  service: ServiceClient,
  card: Card,
): Promise<string[]> {
  const candidates = new Set<string>();
  // HTML-decode upfront — some legacy rows store "Scarlet &amp; Violet Promos"
  // (entity-encoded). Without decoding, normalize() handles it for comparison
  // but the paren splitter / prefix stripper would get the wrong tokens.
  const setName = htmlDecode((card.set_name ?? '').trim());
  if (setName) {
    candidates.add(setName);
    const parenMatch = setName.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (parenMatch) {
      candidates.add(parenMatch[1].trim());
      candidates.add(parenMatch[2].trim());
    }
  }

  // Strip the "Pokémon" / "Pokémon Card" prefix from each candidate (creating
  // new candidates rather than replacing).
  for (const c of [...candidates]) {
    const stripped = c.replace(GAME_PREFIX_RE, '').trim();
    if (stripped && stripped !== c) candidates.add(stripped);
  }

  if (card.set_code && card.set_number) {
    const slashIdx = card.set_number.indexOf('/');
    const numClean = (slashIdx === -1 ? card.set_number : card.set_number.slice(0, slashIdx))
      .trim()
      .replace(/^0+/, '') || '0';
    const { data: catRows } = await service
      .from('tcg_catalog')
      .select('set_name')
      .ilike('set_code', card.set_code)
      .eq('set_number', numClean);
    if (catRows) {
      for (const r of catRows as Array<{ set_name: string | null }>) {
        if (r.set_name) candidates.add(r.set_name.trim());
      }
    }
  }

  // TCGdex bridge — only for languages TCGdex actually exposes a `/sets`
  // endpoint for. CN/KO have no locale in TCGdex (its API would 404 / hang),
  // and JP cards already store the EN-translated name in the dropdown.
  if ((card.language === 'FR' || card.language === 'DE' || card.language === 'IT' || card.language === 'ES' || card.language === 'PT') && setName) {
    const localized = await localizedSetName(setName, 'EN', card.language);
    if (localized) candidates.add(localized);
  }

  return Array.from(candidates).filter(Boolean);
}

/**
 * Look up Cardmarket pricing for one card. Returns a discriminated union so
 * the caller can log the failure reason. Pure function modulo the supabase
 * queries.
 */
export async function lookupCardmarketPricing(
  service: ServiceClient,
  card: Card,
): Promise<LookupOutcome> {
  if (card.variant && UNSUPPORTED_VARIANTS.has(card.variant)) {
    return { ok: false, reason: 'unsupported_variant' };
  }
  if (!card.set_name) return { ok: false, reason: 'missing_set_name' };

  const candidateSetNames = await buildCandidateSetNames(service, card);
  const idx = await loadExpansions(service);

  let expansionIds: number[] = [];
  let matchKind: 'exact' | 'tokens' | null = null;
  for (const candidate of candidateSetNames) {
    const norm = normalize(candidate);
    const exact = idx.byNameNorm.get(norm);
    if (exact && exact.length > 0) { expansionIds = exact; matchKind = 'exact'; break; }
  }
  if (expansionIds.length === 0) {
    // Second pass: token-sorted fuzzy match (catches word-reordered locales).
    for (const candidate of candidateSetNames) {
      const tokens = tokensSorted(candidate);
      if (!tokens) continue;
      const fuzzy = idx.byTokens.get(tokens);
      if (fuzzy && fuzzy.length > 0) { expansionIds = fuzzy; matchKind = 'tokens'; break; }
    }
  }

  if (expansionIds.length === 0) {
    return {
      ok: false,
      reason: 'no_expansion',
      details: `tried: ${candidateSetNames.map((c) => `"${c}"`).join(', ')}`,
    };
  }

  // FAST PATH: cardmarket_card_index lookup by (id_expansion, set_number).
  // Populated by scripts/scrape-cardmarket-cards.ts. When present, returns
  // 1-3 exact idProduct candidates — no name matching, no token tricks.
  if (card.set_number) {
    const slashIdx = card.set_number.indexOf('/');
    const numClean = (slashIdx === -1 ? card.set_number : card.set_number.slice(0, slashIdx))
      .trim()
      .replace(/^0+/, '') || '0';
    const { data: indexRows, error: indexErr } = await service
      .from('cardmarket_card_index')
      .select('id_product, url_path')
      .in('id_expansion', expansionIds)
      .eq('set_number', numClean);
    if (indexErr) throw new Error(`cardmarket_card_index read: ${indexErr.message}`);
    if (indexRows && indexRows.length > 0) {
      const rows = indexRows as Array<{ id_product: number; url_path: string | null }>;
      const urlByProduct = new Map(rows.map((r) => [r.id_product, r.url_path] as const));
      const result = await pickFromProductIds(
        service,
        rows.map((r) => r.id_product),
        card,
        urlByProduct,
      );
      if (result) return result;
    }
  }

  // FALLBACK: name-prefix matching on cardmarket_products. Used when the
  // card_index hasn't been populated yet for this expansion (no scrape run).
  const prefixes = buildSearchPrefixes(card);
  if (prefixes.length === 0) return { ok: false, reason: 'no_product' };

  for (const prefix of prefixes) {
    const prefixNorm = normalize(prefix);
    const { data: products, error: prodErr } = await service
      .from('cardmarket_products')
      .select('id_product')
      .in('id_expansion', expansionIds)
      .eq('card_prefix_normalized', prefixNorm);

    if (prodErr) throw new Error(`cardmarket_products read: ${prodErr.message}`);
    if (!products || products.length === 0) continue;

    const result = await pickFromProductIds(
      service,
      (products as Array<{ id_product: number }>).map((p) => p.id_product),
      card,
      null,
    );
    if (result) return result;
  }

  return {
    ok: false,
    reason: 'no_product',
    details: `match=${matchKind} expansion(s)=[${expansionIds.join(',')}] tried prefixes: ${prefixes.map((p) => `"${p}"`).join(', ')}`,
  };
}

/**
 * Given a list of candidate idProducts (from either the card_index fast path
 * or the prefix fallback), fetch their pricing rows and pick one according to
 * variant + rarity. Returns null when there's no pricing to read.
 *
 * `urlByProduct` is the (id_product → url_path) map from the FAST PATH query.
 * Pass null on the fallback path; we'll do an extra lookup so the picked
 * product still gets its url_path when it has been scraped.
 */
async function pickFromProductIds(
  service: ServiceClient,
  productIds: number[],
  card: Card,
  urlByProduct: Map<number, string | null> | null,
): Promise<LookupOutcome | null> {
  if (productIds.length === 0) return null;
  const { data: prices, error: priceErr } = await service
    .from('cardmarket_pricing')
    .select('id_product, low, trend, avg, low_holo, trend_holo, avg_holo')
    .in('id_product', productIds);
  if (priceErr) throw new Error(`cardmarket_pricing read: ${priceErr.message}`);
  if (!prices || prices.length === 0) return null;

  const priceRows = prices as Array<{
    id_product: number;
    low: number | null;
    trend: number | null;
    avg: number | null;
    low_holo: number | null;
    trend_holo: number | null;
    avg_holo: number | null;
  }>;

  const ambiguous = priceRows.length > 1;
  const pickIdx = ambiguous ? pickAmbiguousIndex(priceRows, card.variant, card.rarity) : 0;
  const picked = priceRows[pickIdx];
  const fields = pickPricingFields(picked, card.variant);

  let urlPath: string | null = urlByProduct?.get(picked.id_product) ?? null;
  if (urlPath == null) {
    // Fallback path: query card_index for the picked id (may still be null
    // if the expansion hasn't been scraped yet).
    const { data: idxRow } = await service
      .from('cardmarket_card_index')
      .select('url_path')
      .eq('id_product', picked.id_product)
      .maybeSingle();
    urlPath = (idxRow as { url_path: string | null } | null)?.url_path ?? null;
  }

  return {
    ok: true,
    idProduct: picked.id_product,
    low: fields.low,
    trend: fields.trend,
    avg: fields.avg,
    source: fields.source,
    ambiguous,
    urlPath,
  };
}
