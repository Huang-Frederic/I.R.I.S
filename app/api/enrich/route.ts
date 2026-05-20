// Enrichment pipeline. Resolves a scanned/typed card to a unique cardmarket
// product (or a small picker list when ambiguous).
//
// Strategy order:
//   0. Cardmarket by (set_prefix + set_number)  — direct unique match.
//   1. Cardmarket by (set_prefix + pokemon_name) — picker fallback for TG/GG
//      cards or when Strategy 0 returns the wrong Pokémon.
//   2. TCGdex live by (set_prefix + set_number) — for cards not in our local
//      cardmarket DB (very old sets, exotic locales).
//   3. Gemini-only                              — last resort, no cardmarket_id,
//      no price; user can still save the bare OCR fields.
//
// Each strategy returns EnrichResult on hit, null to fall through.

import { NextResponse } from 'next/server';
import { apiError, unauthorizedResponse, validationResponse } from '@/lib/utils/api-response';
import { createClient } from '@/lib/supabase/server';
import {
  lookupBySetPrefixAndNumber,
  lookupBySetPrefixAndName,
  type CardmarketCard,
} from '@/lib/api/cardmarket-enrich';
import {
  lookupById as tcgdexLookupById,
  toEnrichedCard as tcgdexToEnrichedCard,
  toTCGdexLang,
} from '@/lib/api/tcgdex';
import POKEMON_NAMES from '@/lib/data/pokemon-names.json';
import type { createClient as _createClient } from '@/lib/supabase/server';
import type { CardLanguage, EnrichResult, EnrichedCard, CardRarity } from '@/lib/types';

export const runtime = 'nodejs';

type SupabaseServerClient = Awaited<ReturnType<typeof _createClient>>;

interface EnrichBody {
  /** 3-4 letter set abbreviation printed on the card (BRS, LOR, BKR, EVO…). */
  setPrefix?: string | null;
  /** Numeric set position. Null when Gemini detected a TG/GG/SV subseries
   *  prefix on the printed number — triggers the picker strategy. */
  setNumber?: string | null;
  /** Total denominator (198 in "12/198"). Optional, used for display only. */
  setTotal?: number | null;
  language?: CardLanguage;

  // Pokémon identification (used by Strategy 1 picker)
  pokemonName?: string | null;
  pokemonNumber?: number | null;
  pokemonNameFr?: string | null;
  /** English species name. Used for cardmarket_products lookup (card_prefix
   *  is always English). When absent, falls back to pokemonName. */
  pokemonNameEn?: string | null;

  // Display-only fields (carried through to UI prefill)
  cardName?: string | null;
  cardNameFr?: string | null;
  rarity?: string | null;
  illustrator?: string | null;
}

interface StrategyContext {
  body: EnrichBody;
  setPrefix: string | null;
  setNumber: string | null;
  language: CardLanguage;
  supabase: SupabaseServerClient;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapGeminiRarity(rarity: string | null | undefined): CardRarity {
  if (!rarity) return 'OTHER';
  const r = rarity.toLowerCase().trim();
  if (r === 'common') return 'C';
  if (r === 'uncommon') return 'UC';
  if (r === 'rare') return 'R';
  if (r === 'holo rare') return 'R_HOLO';
  if (r === 'double rare') return 'RR';
  if (r === 'ultra rare') return 'SR';
  if (r === 'art rare') return 'AR';
  if (r === 'special art rare' || r === 'secret rare' || r === 'hyper rare') return 'SAR';
  return 'OTHER';
}

/**
 * Convert a Cardmarket lookup result into the EnrichedCard shape expected by
 * the scanner UI. OCR-provided fields (rarity, illustrator, pokemon_name_fr,
 * card_name_fr) flow through as supplemental display data.
 */
function cardmarketToEnriched(c: CardmarketCard, body: EnrichBody): EnrichedCard {
  const cardName = body.cardNameFr || body.cardName || c.card_name;
  const pokemonName = body.pokemonNameFr || body.pokemonName || c.card_name;
  return {
    card_id_tcg: c.set_prefix && c.set_number
      ? `${c.set_prefix}-${c.set_number}`
      : c.cardmarket_id
        ? `cm-${c.cardmarket_id}`
        : '',
    card_name: cardName,
    pokemon_name: body.pokemonNumber == null ? '' : pokemonName,
    pokemon_number: body.pokemonNumber ?? null,
    set_name: c.set_name,
    set_code: c.set_prefix,
    set_number: c.set_number,
    rarity: mapGeminiRarity(body.rarity),
    tcg_image_url: c.tcg_image_url,
    cardmarket_id: c.cardmarket_id,
    cm_price_low: null,
    cm_price_trend: null,
    cm_price_avg: null,
  };
}

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

/**
 * Strategy 0 — direct cardmarket lookup by (set_prefix + set_number).
 *
 * Returns:
 *   - 1 result → unique match, return as bestMatch.
 *   - >1 results → reverse-holo / variant siblings, expose as picker.
 *   - 0 results → null, caller falls through.
 *
 * Self-validation: if OCR provided a pokemon_name and the matched product's
 * card_name doesn't agree with it (substring match either way), we DON'T
 * return — the caller falls through to Strategy 1's name-based picker. This
 * catches cases where Gemini mis-read set_prefix and we hit a wrong card at
 * the same numeric position in another set.
 */
async function strategyByPrefixAndNumber(ctx: StrategyContext): Promise<EnrichResult | null> {
  if (!ctx.setPrefix || !ctx.setNumber) {
    console.log(`[enrich] Strategy 0 skipped — missing ${!ctx.setPrefix ? 'setPrefix' : 'setNumber'}`);
    return null;
  }
  console.log(`[enrich] Strategy 0 (cardmarket by prefix+number): ${ctx.setPrefix}-${ctx.setNumber}`);
  const cards = await lookupBySetPrefixAndNumber(ctx.supabase, ctx.setPrefix, ctx.setNumber);
  if (cards.length === 0) {
    console.log(`[enrich] Strategy 0 → 0 results, falling through`);
    return null;
  }

  // Self-validation: cardmarket_products.card_name is ALWAYS English, so we
  // compare against the EN species name. When the user input is FR/JP (manual
  // form entry) we reverse-lookup via the static map first.
  const ocrPokemonEn =
    ctx.body.pokemonNameEn ??
    reverseLookupEn(ctx.body.pokemonName) ??
    reverseLookupEn(ctx.body.pokemonNameFr) ??
    ctx.body.pokemonName;
  if (ocrPokemonEn && cards.length === 1) {
    const a = norm(ocrPokemonEn);
    const b = norm(cards[0].card_name);
    if (a && b && !a.includes(b) && !b.includes(a)) {
      console.log(
        `[enrich] Strategy 0 rejecting "${cards[0].card_name}" — doesn't match OCR pokemon "${ocrPokemonEn}"`,
      );
      return null;
    }
  }

  console.log(`[enrich] Strategy 0 ✓ ${cards.length} card(s): ${cards.map((c) => c.card_name).join(', ')}`);
  const enriched = cards.map((c) => cardmarketToEnriched(c, ctx.body));
  return { bestMatch: enriched[0], candidates: enriched };
}

/**
 * Strategy 1 — picker by (set_prefix + pokemon_name).
 *
 * Used when:
 *   - Gemini returned set_number=null (TG/GG/SV subseries detected).
 *   - Strategy 0 returned 0 results (number mis-read but pokemon clear).
 *   - Strategy 0 returned a pokemon-name mismatch (rejected upstream).
 *
 * Returns up to 10 candidates from the matching expansion(s) whose product
 * card_prefix contains the OCR pokemon name. Caller exposes as picker.
 */
async function strategyByPrefixAndName(ctx: StrategyContext): Promise<EnrichResult | null> {
  if (!ctx.setPrefix) {
    console.log(`[enrich] Strategy 1 skipped — missing setPrefix`);
    return null;
  }
  // cardmarket_products.card_prefix is the FULL English card name with suffix
  // (e.g. "Charizard V", "Trevenant EX", "Marnie"). To match it we need:
  //   1. Pokémon species in EN (from TCGdex dex lookup, reliable)
  //   2. + the printed suffix (ex/V/VMAX/VSTAR/GX/BREAK/LEGEND) from the
  //      native card_name (suffix is language-agnostic, same in FR/JP/EN)
  // For Trainers/Energies (no pokemon_name_en) we fall back to the native
  // card_name — most Trainer names (Marnie, Cynthia, Iono) are cross-language.
  const lookupName = buildLookupName(ctx.body);
  if (!lookupName) {
    console.log(`[enrich] Strategy 1 skipped — missing pokemon/card name`);
    return null;
  }
  console.log(`[enrich] Strategy 1 (cardmarket picker by prefix+name): ${ctx.setPrefix} + "${lookupName}"`);

  const cards = await lookupBySetPrefixAndName(ctx.supabase, ctx.setPrefix, lookupName);
  if (cards.length === 0) {
    console.log(`[enrich] Strategy 1 → 0 results, falling through`);
    return null;
  }
  console.log(`[enrich] Strategy 1 ✓ ${cards.length} candidate(s): ${cards.map((c) => `${c.set_number}:${c.card_name}`).join(', ')}`);

  const enriched = cards.map((c) => cardmarketToEnriched(c, ctx.body));
  return { bestMatch: enriched[0], candidates: enriched };
}

/**
 * Build the English card name to look up against cardmarket_products.card_prefix.
 *
 * Source priority for the EN species:
 *   1. body.pokemonNameEn — pre-translated by the OCR route via static map
 *   2. Reverse-lookup body.pokemonName/pokemonNameFr against the static map
 *      (catches manual form input in FR/JP, e.g. user types "Dracaufeu")
 *   3. body.pokemonName as-is (works for EN cards / Trainers)
 *
 * Suffix (ex/V/VMAX/etc) is appended from the native card_name when available
 * — suffixes are language-agnostic so we extract from whatever's there.
 */
function buildLookupName(body: EnrichBody): string | null {
  const speciesEn =
    body.pokemonNameEn ??
    reverseLookupEn(body.pokemonName) ??
    reverseLookupEn(body.pokemonNameFr) ??
    body.pokemonName;

  if (speciesEn && body.cardName) {
    const suffix = extractSuffix(body.cardName);
    return suffix ? `${speciesEn} ${suffix}` : speciesEn;
  }
  if (speciesEn) return speciesEn;
  // Trainers/Energies — no dex, no derived EN name. Fall back to native
  // (Trainers are usually cross-language: Marnie/Cynthia/Iono).
  return body.cardName ?? null;
}

/**
 * Reverse-lookup a Pokémon name (any of FR/EN/JP) → English species via the
 * static dex map. Case- and diacritic-insensitive. Returns null on no match
 * (typo, Trainer card, non-Pokémon input).
 *
 * Built lazily on first call — the inverted index is built once per process.
 */
let NAME_TO_EN: Map<string, string> | null = null;
function reverseLookupEn(name: string | null | undefined): string | null {
  if (!name) return null;
  if (!NAME_TO_EN) {
    NAME_TO_EN = new Map();
    for (const entry of Object.values(POKEMON_NAMES)) {
      const e = entry as { fr: string; en: string; ja: string };
      if (e.en) {
        if (e.fr) NAME_TO_EN.set(norm(e.fr), e.en);
        if (e.en) NAME_TO_EN.set(norm(e.en), e.en);
        if (e.ja) NAME_TO_EN.set(norm(e.ja), e.en);
      }
    }
  }
  return NAME_TO_EN.get(norm(name)) ?? null;
}

/**
 * Extract the trailing suffix from a card name (ex/EX/GX/V/VMAX/VSTAR/V-UNION/
 * BREAK/LEGEND). Suffixes are printed identically across languages, so we can
 * pull from the native card_name and append to the EN species. Case is kept
 * as-printed — Strategy 1's lookup normalizes both sides anyway.
 */
function extractSuffix(cardName: string): string {
  const m = cardName.match(/[\s-]+(ex|EX|GX|V|VMAX|VSTAR|V-?UNION|BREAK|LEGEND)\s*$/i);
  return m ? m[1] : '';
}

/**
 * Strategy 2 — TCGdex live lookup. Covers cards not in our local cardmarket
 * dump (very old sets, exotic locales). HTTP round-trip — slower than 0/1.
 *
 * Pokémon translations are NOT taken from TCGdex (its dexId field is wrong on
 * themed sets — e.g. SV2A "Pokémon Card 151" tags every card with dex=151
 * regardless of the actual Pokémon, leading to "Mew (リザード)" garbage). We
 * use Gemini's pokemon_number + our static map for translations, and rely on
 * TCGdex only for set/image metadata.
 */
async function strategyTCGdex(ctx: StrategyContext): Promise<EnrichResult | null> {
  if (!ctx.setPrefix || !ctx.setNumber) {
    console.log(`[enrich] Strategy 2 skipped — needs setPrefix + setNumber`);
    return null;
  }
  const tcgdexLang = toTCGdexLang(ctx.language);
  console.log(`[enrich] Strategy 2 (TCGdex live): ${ctx.setPrefix}-${ctx.setNumber} [${tcgdexLang}]`);
  try {
    const card = await tcgdexLookupById(ctx.setPrefix, ctx.setNumber, tcgdexLang);
    if (!card) {
      console.log(`[enrich] Strategy 2 → no TCGdex match, falling through`);
      return null;
    }
    // Build the EnrichedCard from TCGdex metadata, then OVERRIDE the Pokémon
    // identity with what Gemini saw + our static map. Gemini's pokemon_number
    // is OCR-d from the printed national-dex; TCGdex's dexId is editorial
    // metadata that's frequently wrong on themed/promo sets.
    const tcgdex = tcgdexToEnrichedCard(card);
    const final: EnrichedCard = {
      ...tcgdex,
      pokemon_number: ctx.body.pokemonNumber ?? tcgdex.pokemon_number,
      pokemon_name: ctx.body.pokemonName ?? tcgdex.pokemon_name,
      // Prefer the raw TCGdex name as the base for bilingual formatting.
      // ctx.body.cardName may already be bilingual ("FR (JP)") from a previous
      // enrichment pass and would produce double-wrapped names on re-search.
      card_name: tcgdex.card_name || ctx.body.cardName || '',
    };
    // Apply FR bilingual format on Pokémon cards when source language isn't FR.
    // Use static map keyed by Gemini's number — never TCGdex's dexId.
    if (final.pokemon_number && ctx.language !== 'FR') {
      const entry = (POKEMON_NAMES as Record<string, { fr: string; en: string; ja: string }>)[
        String(final.pokemon_number)
      ];
      if (entry?.fr) {
        final.pokemon_name = `${entry.fr} (${final.pokemon_name})`;
        final.card_name = `${entry.fr} (${final.card_name})`;
      }
    }
    console.log(`[enrich] Strategy 2 ✓ ${final.card_name}`);
    return { bestMatch: final, candidates: [final] };
  } catch (e) {
    console.warn('[enrich] Strategy 2 errored, falling through:', e);
    return null;
  }
}

/**
 * Strategy 3 — Gemini-only fallback. No cardmarket_id, no image, no price.
 * Looks up set_name from cardmarket_expansions when we have set_prefix —
 * keeps the form's "Set name" field populated even when nothing else hits.
 * User can still save the card with bare OCR fields — better than blocking.
 */
async function strategyGeminiOnly(ctx: StrategyContext): Promise<EnrichResult | null> {
  const cardName = ctx.body.cardNameFr || ctx.body.cardName;
  if (!cardName) {
    console.log(`[enrich] Strategy 3 skipped — no card_name from OCR`);
    return null;
  }
  console.log(`[enrich] Strategy 3 (Gemini-only fallback) for "${cardName}"`);

  let setName = '';
  if (ctx.setPrefix) {
    setName = (await lookupSetName(ctx.supabase, ctx.setPrefix)) ?? '';
    if (setName) {
      console.log(`[enrich] Strategy 3 — resolved set_name "${setName}" from prefix ${ctx.setPrefix}`);
    }
  }

  const enriched: EnrichedCard = {
    card_id_tcg: ctx.setPrefix && ctx.setNumber ? `${ctx.setPrefix}-${ctx.setNumber}` : '',
    card_name: cardName,
    pokemon_name:
      ctx.body.pokemonNumber == null
        ? ''
        : ctx.body.pokemonNameFr || ctx.body.pokemonName || cardName,
    pokemon_number: ctx.body.pokemonNumber ?? null,
    set_name: setName,
    set_code: ctx.setPrefix ?? '',
    set_number: ctx.setNumber ?? '',
    rarity: mapGeminiRarity(ctx.body.rarity),
    tcg_image_url: '',
    cardmarket_id: '',
    cm_price_low: null,
    cm_price_trend: null,
    cm_price_avg: null,
  };
  return { bestMatch: enriched, candidates: [enriched] };
}

/**
 * Resolve a set prefix (BRS, LOR, EVO…) to its English display name via
 * cardmarket_expansions. Returns null when the prefix isn't in the table.
 */
async function lookupSetName(
  supabase: SupabaseServerClient,
  setPrefix: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('cardmarket_expansions')
    .select('name, name_en')
    .ilike('set_prefix', setPrefix)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const row = data as { name: string | null; name_en: string | null };
  return row.name_en ?? row.name ?? null;
}

// ---------------------------------------------------------------------------
// POST handler — thin orchestrator over the 4 strategies.
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  let body: EnrichBody;
  try {
    body = (await request.json()) as EnrichBody;
  } catch {
    return validationResponse('Invalid JSON body');
  }

  const setPrefix = body.setPrefix?.trim().toUpperCase() || null;
  const setNumber = parseSetNumber(body.setNumber);
  const language = body.language ?? 'EN';

  // Need at least set_prefix or pokemon_name to do anything useful.
  const hasPokemon = !!(body.pokemonName || body.pokemonNameFr || body.cardName);
  if (!setPrefix && !hasPokemon) {
    return validationResponse('Provide either setPrefix or a pokemon/card name.');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return unauthorizedResponse();

  const ctx: StrategyContext = { body, setPrefix, setNumber, language, supabase };

  console.log(`[enrich] === input: prefix=${setPrefix} number=${setNumber} pokemon=${body.pokemonName ?? body.pokemonNameFr ?? '-'} lang=${language} ===`);
  try {
    const r0 = await strategyByPrefixAndNumber(ctx);
    if (r0) return NextResponse.json(r0 satisfies EnrichResult);

    const r1 = await strategyByPrefixAndName(ctx);
    if (r1) return NextResponse.json(r1 satisfies EnrichResult);

    const r2 = await strategyTCGdex(ctx);
    if (r2) return NextResponse.json(r2 satisfies EnrichResult);

    const r3 = await strategyGeminiOnly(ctx);
    if (r3) return NextResponse.json(r3 satisfies EnrichResult);

    console.log(`[enrich] All strategies failed → returning null bestMatch`);
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
// Utilities
// ---------------------------------------------------------------------------

function norm(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '');
}

/**
 * Parse the body.setNumber input into the digit-only form stored in
 * cardmarket_card_index. Strips slashes ("12/198" → "12"), leading zeros
 * ("012" → "12"). Returns null when input is null, blank, or starts with a
 * subseries prefix like TG/GG/SV/RC (which the picker strategy handles).
 */
function parseSetNumber(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  // Subseries markers — caller must use the picker strategy.
  if (/^(TG|GG|SV|SVE|RC)\d/i.test(trimmed)) return null;
  const digitsOnly = trimmed.split('/')[0].replace(/\D/g, '');
  if (!digitsOnly) return null;
  return String(parseInt(digitsOnly, 10));
}
