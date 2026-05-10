// 6-strategy enrichment pipeline. Each strategy is a named function that
// either returns a populated EnrichResult or `null` to fall through to the
// next. The POST handler is intentionally a thin orchestrator.
//
// Order of attempts:
//   1. Catalog by code         (set_code + set_number + language)
//   2. Catalog by total        (printed denominator + localId, OCR-name disambig)
//   2.5 Catalog by name+localId (Gemini illustrator auto-disambig if available)
//   3. TCGdex live (3a subseries probe, fuzzy code, direct, by total, 3b dex probe)
//   5. Gemini-only fallback    (KO/CN exotic, no catalog hit)
//   6. Null bestMatch          (caller pre-fills bare OCR fields)
//
// Strategies 1–2.5 are skipped when setCode is a known subseries prefix
// (TG/GG) — Strategy 3a handles those better and the catalog can produce
// wildly wrong matches (DRM-3 for TG-3/30 because Dragon Majesty has 30 cards).

import { NextResponse } from 'next/server';
import { apiError, unauthorizedResponse, validationResponse } from '@/lib/utils/api-response';
import { createClient } from '@/lib/supabase/server';
import {
  disambiguateByIllustrator,
  disambiguateByName,
  lookupByCode,
  lookupByNameAndLocalId,
  lookupByTotal,
  rowToEnrichedCard,
  formatBilingualName,
  deriveCardNameFr,
} from '@/lib/api/tcg-catalog';
import { lookupCardmarketStrategy0 } from '@/lib/api/cardmarket-enrich';
import { verifyByIllustrator } from '@/lib/api/enrich-cross-validate';
import {
  enrichWithFrenchNames,
  findCardsByTotalAndLocalId,
  listSets,
  lookupById as tcgdexLookupById,
  lookupSubseries as tcgdexLookupSubseries,
  probeSubseriesByDex as tcgdexProbeSubseriesByDex,
  toEnrichedCard as tcgdexToEnrichedCard,
  toTCGdexLang,
  type TCGdexCard,
} from '@/lib/api/tcgdex';
import { findKnownSetCodeInText } from '@/lib/utils/extract-from-words';
import { parseSetNumber } from '@/lib/utils/parse-set-number';
import type { createClient as _createClient } from '@/lib/supabase/server';
import type { CardLanguage, EnrichResult, EnrichedCard } from '@/lib/types';

export const runtime = 'nodejs';

type SupabaseServerClient = Awaited<ReturnType<typeof _createClient>>;

interface EnrichBody {
  text?: string;
  setCode?: string;
  localId?: string;
  total?: string | number;
  language?: CardLanguage;

  // Gemini structured output
  pokemonNumber?: number | null;
  pokemonNameFr?: string | null;
  /** Full FR card name from Gemini — preferred source for card_name_fr,
   *  covers Trainers/Energies that the dataset-based fallback can't handle. */
  cardNameFr?: string | null;
  setName?: string | null;
  setNameFr?: string | null;

  // Strategy 5 (Gemini-only fallback) inputs — used when catalog + TCGdex both
  // miss (typically KO/CN cards or exotic Crown Series sets).
  cardName?: string | null;
  pokemonName?: string | null;
  rarity?: string | null;

  /** Illustrator credit from Gemini. Used by Strategy 2.5 to auto-disambiguate
   *  when multiple catalog rows match (pokemon_name + localId + language). */
  illustrator?: string | null;
}

/** Per-strategy context — built once at the top of POST and threaded down. */
interface StrategyContext {
  body: EnrichBody;
  setCode: string | null;
  localId: string | null;
  total: number | null;
  language: CardLanguage;
  supabase: SupabaseServerClient;
}

// ---------------------------------------------------------------------------
// Helpers (unchanged behavior, just regrouped)
// ---------------------------------------------------------------------------

/**
 * Map Gemini's free-form rarity strings to our CardRarity enum. Same vocabulary
 * as the TCGdex/LimitlessTCG mappers but lighter — only the values Gemini
 * actually returns from its prompt's rarity enum.
 */
function mapGeminiRarity(rarity: string | null | undefined): EnrichedCard['rarity'] {
  if (!rarity) return 'OTHER';
  const r = rarity.toLowerCase().trim();
  if (r === 'common') return 'C';
  if (r === 'uncommon') return 'UC';
  if (r === 'rare') return 'R';
  if (r === 'holo rare') return 'R_HOLO';
  if (r === 'double rare') return 'RR';
  if (r === 'ultra rare') return 'SR';
  if (r === 'art rare') return 'AR';
  if (r === 'special art rare') return 'SAR';
  if (r === 'secret rare') return 'SAR';
  if (r === 'hyper rare') return 'SAR';
  if (r === 'promo') return 'OTHER';
  return 'OTHER';
}

/** Race a promise against a timeout, returning null instead of rejecting. */
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T | null> {
  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => {
      console.warn(`enrich: ${label} timed out after ${ms}ms`);
      resolve(null);
    }, ms),
  );
  return Promise.race([promise, timeout]);
}

/**
 * Enrich an EnrichedCard with Gemini-extracted data (bilingual names + pokemon_number).
 * Formats names as "FR (Original)" when scanned card is non-FR and Gemini provided FR.
 */
function applyGeminiEnrichments(
  enriched: EnrichedCard,
  body: EnrichBody,
  language: CardLanguage,
): EnrichedCard {
  // Source priority for the FR card name:
  //  1. Gemini's `card_name_fr` — covers Trainers/Energies + reliable suffix.
  //  2. deriveCardNameFr — pokemonNameFr + suffix extracted from original.
  //     Only fires for Pokémon cards (no pokemonNameFr → returns null).
  const cardNameFr = body.cardNameFr ?? deriveCardNameFr(enriched.card_name, body.pokemonNameFr);
  // Defense-in-depth: coerce any out-of-range value (0, negatives, >1025) to
  // null. Gemini occasionally returns 0 for Trainers despite the prompt.
  const rawPokemonNumber = enriched.pokemon_number ?? body.pokemonNumber ?? null;
  const finalPokemonNumber =
    typeof rawPokemonNumber === 'number' && rawPokemonNumber >= 1 && rawPokemonNumber <= 1025
      ? rawPokemonNumber
      : null;
  // For non-Pokémon cards (Trainers/Energies/Stadium), pokemon_name is just
  // a redundant copy of card_name in the catalog (legacy NOT NULL workaround).
  // Blank it so the scanner form leaves the "Nom Pokémon" field empty.
  const finalPokemonName =
    finalPokemonNumber == null
      ? ''
      : formatBilingualName(enriched.pokemon_name, body.pokemonNameFr, language);
  return {
    ...enriched,
    card_name: formatBilingualName(enriched.card_name, cardNameFr, language),
    pokemon_name: finalPokemonName,
    set_name: formatBilingualName(enriched.set_name, body.setNameFr, language),
    pokemon_number: finalPokemonNumber,
  };
}

/** Map a single catalog row → EnrichResult shape (used by all catalog strategies). */
function rowToResult(row: Parameters<typeof rowToEnrichedCard>[0], body: EnrichBody, lang: CardLanguage): EnrichResult {
  const enriched = applyGeminiEnrichments(rowToEnrichedCard(row), body, lang);
  return { bestMatch: enriched, candidates: [enriched] };
}

/** Map multiple catalog rows → EnrichResult, applying name disambiguation if available. */
function rowsToResult(
  rows: Parameters<typeof rowToEnrichedCard>[0][],
  body: EnrichBody,
  lang: CardLanguage,
): EnrichResult | null {
  const result = body.text && rows.length > 1
    ? disambiguateByName(rows, body.text)
    : { best: rows[0]!, candidates: rows };
  if (!result.best) return null;
  return {
    bestMatch: applyGeminiEnrichments(rowToEnrichedCard(result.best), body, lang),
    candidates: result.candidates.map((r) => applyGeminiEnrichments(rowToEnrichedCard(r), body, lang)),
  };
}

// ---------------------------------------------------------------------------
// Strategies — each returns EnrichResult on hit, null to fall through.
// ---------------------------------------------------------------------------

/**
 * Strategy 0 — local Cardmarket lookup (fast path, no network).
 *
 * Resolves cards by (set_name, set_number, language) directly against our
 * scraped cardmarket_card_index + cardmarket_products tables. When it hits,
 * we get cardmarket_id, url_path, name, and the canonical EN set_name in one
 * shot — no TCGdex round-trips needed.
 *
 * For fields cardmarket doesn't carry (rarity, pokemon_number, illustrator),
 * we fall through OCR-provided values from the request body.
 */
async function strategyCardmarketIndex(ctx: StrategyContext): Promise<EnrichResult | null> {
  const setName = ctx.body.setName;
  const setNumber = ctx.localId;
  const language = ctx.language;
  if (!setName || !setNumber) return null;

  const hit = await lookupCardmarketStrategy0(ctx.supabase, {
    setName,
    setNumber: String(setNumber),
    language: language.toLowerCase(),
  });
  if (!hit) return null;

  const card: EnrichedCard = {
    card_id_tcg: '',
    card_name: hit.card_name,
    pokemon_name: ctx.body.pokemonName ?? '',
    pokemon_number: ctx.body.pokemonNumber ?? null,
    set_name: hit.set_name,
    set_code: ctx.setCode ?? '',
    set_number: String(setNumber),
    rarity: mapGeminiRarity(ctx.body.rarity),
    tcg_image_url: hit.tcg_image_url,
    cardmarket_id: hit.cardmarket_id,
    cm_price_low: null,
    cm_price_trend: null,
    cm_price_avg: null,
  };

  return { bestMatch: card, candidates: [card] };
}

async function strategyCatalogByCode(ctx: StrategyContext): Promise<EnrichResult | null> {
  const { setCode, localId, language, supabase, body } = ctx;
  if (!setCode || !localId) return null;
  try {
    const row = await withTimeout(
      lookupByCode(supabase, setCode, localId, language),
      5000,
      'catalog lookupByCode',
    );
    if (row) return rowToResult(row, body, language);
  } catch (e) {
    console.error('Strategy 1 (catalog by code) failed, falling through:', e);
  }
  return null;
}

async function strategyCatalogByTotal(ctx: StrategyContext): Promise<EnrichResult | null> {
  const { total, localId, language, supabase, body } = ctx;
  if (total == null || !localId) return null;
  try {
    const rows = await withTimeout(
      lookupByTotal(supabase, total, localId, language),
      5000,
      'catalog lookupByTotal',
    );
    if (rows && rows.length > 0) return rowsToResult(rows, body, language);
  } catch (e) {
    console.error('Strategy 2 (catalog by total) failed, falling through:', e);
  }
  return null;
}

/** Strategy 2.5 — catalog search by pokemon_name + localId.
 *  Useful for old cards without a recognizable set_code where Gemini extracted
 *  the Pokémon name + the localId. Returns up to 15 candidates; illustrator
 *  from Gemini auto-disambiguates when available, otherwise the visual picker
 *  takes over. */
async function strategyCatalogByNameAndLocalId(ctx: StrategyContext): Promise<EnrichResult | null> {
  const { localId, language, supabase, body } = ctx;
  if (!body.pokemonName || !localId) return null;
  try {
    const rows = await withTimeout(
      lookupByNameAndLocalId(supabase, body.pokemonName, localId, language),
      5000,
      'catalog lookupByNameAndLocalId',
    );
    if (!rows || rows.length === 0) return null;

    // Try illustrator-based auto-disambiguation FIRST (most reliable).
    const byIllustrator = disambiguateByIllustrator(rows, body.illustrator);
    if (byIllustrator) return rowToResult(byIllustrator, body, language);

    // Fallback: name-substring disambig + picker.
    return rowsToResult(rows, body, language);
  } catch (e) {
    console.error('Strategy 2.5 (catalog by name+localId) failed, falling through:', e);
  }
  return null;
}

/**
 * Strategy 3 — TCGdex live fallback. Tries 4 sub-probes in order:
 *   3a. subseries (TG/GG/SWSH+/SVP+...) — maps printed code to parent set
 *       and disambiguates by national dex.
 *   - fuzzy code from text body.
 *   - direct lookupById.
 *   - by total + localId across all sets.
 *   3b. blind dex probe (TG/GG only) when set_code is hallucinated.
 *
 * Returns the matched card + the sibling candidates (when via total+localId
 * lookup; single-element array otherwise). Caller wraps in EnrichResult.
 */
async function findTCGdexCard(ctx: StrategyContext): Promise<{
  card: TCGdexCard | null;
  candidates: TCGdexCard[];
}> {
  const { setCode, localId, total, language, body } = ctx;
  const tcgdexLang = toTCGdexLang(language);
  let card: TCGdexCard | null = null;

  if (setCode && localId) {
    card = await tcgdexLookupSubseries(setCode, localId, body.text, tcgdexLang, body.pokemonNumber);
  }
  if (!card && body.text && localId) {
    const sets = await listSets(tcgdexLang);
    const fuzzyCode = findKnownSetCodeInText(body.text, sets.map((s) => s.id));
    if (fuzzyCode) card = await tcgdexLookupById(fuzzyCode, localId, tcgdexLang);
  }
  if (!card && setCode && localId) {
    card = await tcgdexLookupById(setCode, localId, tcgdexLang);
  }

  let candidates: TCGdexCard[] = [];
  if (!card && total != null && localId) {
    candidates = await findCardsByTotalAndLocalId(total, localId, tcgdexLang);
    card = candidates[0] ?? null;
  }

  // Last-chance probe — when Gemini hallucinated the set_code (e.g. "DRM" for
  // a Lost Origin Trainer Gallery card), blind-probe TG/GG parents and only
  // accept a strict national-dex match.
  if (!card && body.pokemonNumber && localId) {
    card = await tcgdexProbeSubseriesByDex(localId, body.pokemonNumber, tcgdexLang);
  }
  return { card, candidates };
}

async function strategyTCGdex(ctx: StrategyContext): Promise<EnrichResult | null> {
  const { card, candidates } = await findTCGdexCard(ctx);
  if (!card) return null;

  const tcgdexLang = toTCGdexLang(ctx.language);
  const enriched = await enrichWithFrenchNames(tcgdexToEnrichedCard(card), tcgdexLang);
  const enrichedCandidates: EnrichedCard[] =
    candidates.length > 1
      ? await Promise.all(
          candidates.map((c) => enrichWithFrenchNames(tcgdexToEnrichedCard(c), tcgdexLang)),
        )
      : [enriched];

  // TCGdex already formats bilingual names; only add pokemon_number from Gemini
  // when the catalog row had it null.
  const withPokemonNumber = (c: EnrichedCard): EnrichedCard => ({
    ...c,
    pokemon_number: c.pokemon_number ?? ctx.body.pokemonNumber ?? null,
  });
  return {
    bestMatch: withPokemonNumber(enriched),
    candidates: enrichedCandidates.map(withPokemonNumber),
  };
}

/**
 * Strategy 5 — Gemini-only fallback. Catalog + TCGdex both miss but Gemini
 * has produced enough data to build a usable EnrichedCard (typical for KO/CN
 * Crown Series, exotic promos, brand-new sets). User completes the form from
 * a pre-filled state instead of re-typing everything.
 */
function strategyGeminiOnlyFallback(ctx: StrategyContext): EnrichResult | null {
  const { body, setCode, localId, total, language } = ctx;
  if (!body.cardName || !setCode || !localId) return null;
  const card = buildGeminiOnlyCard(body, setCode, localId, total, language);
  return { bestMatch: card, candidates: [card] };
}

/**
 * Synthesize an EnrichedCard from Gemini's raw extraction. Pricing +
 * cardmarket_id are null. image_url is empty — frontend falls back to the
 * PokeAPI sprite via cardImageUrl helper.
 */
function buildGeminiOnlyCard(
  body: EnrichBody,
  setCode: string,
  localId: string,
  total: number | null,
  language: CardLanguage,
): EnrichedCard {
  const localIdNorm = localId.replace(/^0+/, '') || '0';
  const setNumberFmt = total != null ? `${localIdNorm}/${total}` : localIdNorm;
  const cardName = body.cardName ?? '';
  const pokemonNumber =
    typeof body.pokemonNumber === 'number' && body.pokemonNumber >= 1 && body.pokemonNumber <= 1025
      ? body.pokemonNumber
      : null;
  const pokemonName =
    pokemonNumber == null
      ? ''
      : formatBilingualName(body.pokemonName ?? cardName, body.pokemonNameFr, language);
  const cardNameFr = body.cardNameFr ?? deriveCardNameFr(cardName, body.pokemonNameFr);
  return {
    card_id_tcg: `${setCode}-${localIdNorm}`,
    card_name: formatBilingualName(cardName, cardNameFr, language),
    pokemon_name: pokemonName,
    pokemon_number: pokemonNumber,
    set_name: formatBilingualName(body.setName ?? setCode, body.setNameFr, language),
    set_code: setCode,
    set_number: setNumberFmt,
    rarity: mapGeminiRarity(body.rarity),
    tcg_image_url: '',
    cardmarket_id: null,
    cm_price_low: null,
    cm_price_trend: null,
    cm_price_avg: null,
  };
}

// ---------------------------------------------------------------------------
// POST handler — thin orchestrator.
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  let body: EnrichBody;
  try {
    body = (await request.json()) as EnrichBody;
  } catch {
    return validationResponse('Invalid JSON body');
  }

  const { setCode, localId, total, language } = normalize(body);
  if (!localId && !body.text) {
    return validationResponse('Provide either "text" or "localId" (with optional setCode/total).');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return unauthorizedResponse();

  const ctx: StrategyContext = {
    body,
    setCode,
    localId,
    total,
    language: language ?? 'EN',
    supabase,
  };

  // TG/GG subseries (Trainer Gallery, Galarian Gallery) have their own
  // Cardmarket subseries (e.g. "Astral Radiance: Trainer Gallery") with
  // independent numbering. The OCR returns the parent set_name + a "TG"/"GG"
  // set_code, so a naive lookup by (parent_set_name, set_number) would match
  // the wrong card from the main set. Skip Strategy 0 + catalog and let
  // TCGdex (which has proper subseries handling) take over.
  const skipCatalog = setCode ? /^(TG|GG)$/i.test(setCode) : false;

  // Cross-validate every strategy hit against the OCR illustrator. When OCR
  // says a set the catalog disagrees with (e.g. Gemini misreading LOR as BRS
  // for a Trainer Gallery Charizard with illustrator GIDORA), search across
  // all sets for a card matching (illustrator + set_number + pokemon_name).
  // Auto-correct on a unique alternative; expose multiple via candidates[].
  async function verify(r: EnrichResult): Promise<EnrichResult> {
    return verifyByIllustrator(
      {
        supabase,
        ocrIllustrator: body.illustrator,
        ocrPokemonName: body.pokemonName ?? body.pokemonNameFr,
        ocrSetNumber: localId,
        ocrLanguage: ctx.language,
      },
      r,
    );
  }

  if (!skipCatalog) {
    // Strategy 0: local Cardmarket index lookup (fast path).
    const r0 = await strategyCardmarketIndex(ctx);
    if (r0) return NextResponse.json(await verify(r0) satisfies EnrichResult);

    const r1 = await strategyCatalogByCode(ctx);
    if (r1) return NextResponse.json(await verify(r1) satisfies EnrichResult);
    const r2 = await strategyCatalogByTotal(ctx);
    if (r2) return NextResponse.json(await verify(r2) satisfies EnrichResult);
    const r25 = await strategyCatalogByNameAndLocalId(ctx);
    if (r25) return NextResponse.json(await verify(r25) satisfies EnrichResult);
  }

  try {
    const r3 = await strategyTCGdex(ctx);
    if (r3) return NextResponse.json(await verify(r3) satisfies EnrichResult);

    const r5 = strategyGeminiOnlyFallback(ctx);
    if (r5) return NextResponse.json(await verify(r5) satisfies EnrichResult);

    // Strategy 6: nothing usable — caller falls back to bare OCR fields.
    return NextResponse.json({ bestMatch: null, candidates: [] } satisfies EnrichResult);
  } catch (error) {
    console.error('Enrich failed:', error);
    return apiError('enrich_failed', {
      status: 502,
      message: error instanceof Error ? error.message : 'Enrich failed',
    });
  }
}

// ---------------------------------------------------------------------------
// Body normalization
// ---------------------------------------------------------------------------

function normalize(body: EnrichBody): {
  setCode: string | null;
  localId: string | null;
  total: number | null;
  language: CardLanguage | undefined;
} {
  const setCode = body.setCode?.trim() || null;
  let localId: string | null = null;
  let total: number | null = null;

  if (body.localId) {
    const parts = String(body.localId).split('/');
    localId = parts[0]?.trim() || null;
    if (parts[1]) {
      const t = Number(parts[1].trim());
      if (Number.isFinite(t)) total = t;
    }
  }
  if (total === null && body.total != null) {
    const t = Number(String(body.total).trim());
    if (Number.isFinite(t)) total = t;
  }
  if (!localId && body.text) {
    const parsed = parseSetNumber(body.text);
    if (parsed) {
      localId = parsed.card;
      const t = Number(parsed.total);
      if (Number.isFinite(t)) total = t;
    }
  }

  return { setCode, localId, total, language: body.language };
}
