// app/api/enrich/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  disambiguateByName,
  lookupByCode,
  lookupByTotal,
  rowToEnrichedCard,
  formatBilingualName,
  deriveCardNameFr,
} from '@/lib/api/tcg-catalog';
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
import type { CardLanguage, EnrichResult, EnrichedCard } from '@/lib/types';

export const runtime = 'nodejs';

interface EnrichBody {
  text?: string;
  setCode?: string;
  localId?: string;
  total?: string | number;
  language?: CardLanguage;

  // NEW — from Gemini extraction (Chunk 1)
  pokemonNumber?: number | null;
  pokemonNameFr?: string | null;
  setName?: string | null;
  setNameFr?: string | null;

  // Strategy 5 (Gemini-only fallback) inputs — used when catalog + TCGdex
  // both miss (typically KO/ZH cards or exotic Crown Series sets that no
  // open data source covers). Lets the client pre-fill the form from raw
  // Gemini extraction without forcing the user to re-type everything.
  cardName?: string | null;
  pokemonName?: string | null;
  rarity?: string | null;
}

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

/**
 * Synthesize an EnrichedCard from Gemini's raw extraction when no catalog
 * source has the card. Pricing + cardmarket_id are null (no source for KO/ZH
 * Crown Series anyway). image_url is empty — frontend falls back to the
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
  const pokemonName = body.pokemonName ?? cardName;
  return {
    card_id_tcg: `${setCode}-${localIdNorm}`,
    card_name: formatBilingualName(cardName, deriveCardNameFr(cardName, body.pokemonNameFr), language),
    pokemon_name: formatBilingualName(pokemonName, body.pokemonNameFr, language),
    pokemon_number: body.pokemonNumber ?? null,
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

/** Helper: race a promise against a timeout, returning null instead of rejecting on timeout. */
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
  const cardNameFr = deriveCardNameFr(enriched.card_name, body.pokemonNameFr);
  return {
    ...enriched,
    card_name: formatBilingualName(enriched.card_name, cardNameFr, language),
    pokemon_name: formatBilingualName(enriched.pokemon_name, body.pokemonNameFr, language),
    set_name: formatBilingualName(enriched.set_name, body.setNameFr, language),
    pokemon_number: enriched.pokemon_number ?? body.pokemonNumber ?? null,
  };
}

/**
 * Resolution strategy:
 *   1. tcg_catalog direct lookup (set_code + set_number + language)
 *   2. tcg_catalog fallback by printed total + localId, OCR-name disambiguation
 *   3. TCGdex live (filet de secours: cards too new to be in our catalog)
 *   4. Return null + extracted fields → user fills the form by hand
 */
export async function POST(request: Request) {
  let body: EnrichBody;
  try {
    body = (await request.json()) as EnrichBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { setCode, localId, total, language } = normalize(body);
  if (!localId && !body.text) {
    return NextResponse.json(
      { error: 'Provide either "text" or "localId" (with optional setCode/total).' },
      { status: 400 },
    );
  }

  const cardLang: CardLanguage = language ?? 'EN';
  const supabase = await createClient();

  // Strategy 1: catalog direct lookup (soft dependency — fall through on error)
  if (setCode && localId) {
    try {
      const row = await withTimeout(
        lookupByCode(supabase, setCode, localId, cardLang),
        2000,
        'catalog lookupByCode',
      );
      if (row) {
        const enriched = applyGeminiEnrichments(rowToEnrichedCard(row), body, cardLang);
        return NextResponse.json({
          bestMatch: enriched,
          candidates: [enriched],
        } satisfies EnrichResult);
      }
    } catch (e) {
      console.error('Strategy 1 (catalog by code) failed, falling through:', e);
    }
  }

  // Strategy 2: catalog fallback by total (requires `total` — without it we go to TCGdex)
  if (total != null && localId) {
    try {
      const rows = await withTimeout(
        lookupByTotal(supabase, total, localId, cardLang),
        2000,
        'catalog lookupByTotal',
      );
      if (rows && rows.length > 0) {
        const result = body.text && rows.length > 1
          ? disambiguateByName(rows, body.text)
          : { best: rows[0]!, candidates: rows };
        if (result.best) {
          return NextResponse.json({
            bestMatch: applyGeminiEnrichments(rowToEnrichedCard(result.best), body, cardLang),
            candidates: result.candidates.map((r) => applyGeminiEnrichments(rowToEnrichedCard(r), body, cardLang)),
          } satisfies EnrichResult);
        }
      }
    } catch (e) {
      console.error('Strategy 2 (catalog by total) failed, falling through:', e);
    }
  }

  try {
    // Strategy 3: TCGdex live fallback (newest cards not yet scraped)
    const tcgdexLang = toTCGdexLang(cardLang);
    let tcgdexCard: TCGdexCard | null = null;

    // Strategy 3a: subseries probe — handles TG/GG/SWSH+/XY+/SM+ promo
    // patterns where the printed code maps to a parent set in TCGdex
    // (e.g. TG/3 → swsh11-TG03, SWSH201/201 → swshp-SWSH201).
    // Disambiguation prefers `pokemonNumber` (national dex from Gemini) which
    // is more reliable than card_name substring match across multi-set probes.
    if (setCode && localId) {
      tcgdexCard = await tcgdexLookupSubseries(setCode, localId, body.text, tcgdexLang, body.pokemonNumber);
    }

    if (!tcgdexCard && body.text && localId) {
      const sets = await listSets(tcgdexLang);
      const fuzzyCode = findKnownSetCodeInText(body.text, sets.map((s) => s.id));
      if (fuzzyCode) tcgdexCard = await tcgdexLookupById(fuzzyCode, localId, tcgdexLang);
    }
    if (!tcgdexCard && setCode && localId) {
      tcgdexCard = await tcgdexLookupById(setCode, localId, tcgdexLang);
    }
    let tcgdexCandidates: TCGdexCard[] = [];
    if (!tcgdexCard && total != null && localId) {
      tcgdexCandidates = await findCardsByTotalAndLocalId(total, localId, tcgdexLang);
      tcgdexCard = tcgdexCandidates[0] ?? null;
    }

    // Strategy 3b: subseries dex probe — last-chance attempt when Gemini
    // hallucinated the set_code (e.g. "DRM" for a Lost Origin Trainer Gallery
    // card). If pokemon_number is present, blind-probe TG/GG parents and only
    // accept a strict dex match.
    if (!tcgdexCard && body.pokemonNumber && localId) {
      tcgdexCard = await tcgdexProbeSubseriesByDex(localId, body.pokemonNumber, tcgdexLang);
    }
    if (tcgdexCard) {
      const enriched = await enrichWithFrenchNames(tcgdexToEnrichedCard(tcgdexCard), tcgdexLang);
      const candidates: EnrichedCard[] =
        tcgdexCandidates.length > 1
          ? await Promise.all(
              tcgdexCandidates.map((c) =>
                enrichWithFrenchNames(tcgdexToEnrichedCard(c), tcgdexLang),
              ),
            )
          : [enriched];
      // TCGdex already formats bilingual names, so only add pokemon_number from Gemini if catalog had null
      const withPokemonNumber = (card: EnrichedCard): EnrichedCard => ({
        ...card,
        pokemon_number: card.pokemon_number ?? body.pokemonNumber ?? null,
      });
      return NextResponse.json({
        bestMatch: withPokemonNumber(enriched),
        candidates: candidates.map(withPokemonNumber),
      } satisfies EnrichResult);
    }

    // Strategy 5: Gemini-only fallback. Catalog + TCGdex both miss but Gemini
    // has produced enough data to build a usable EnrichedCard (typical for
    // KO/ZH Crown Series, exotic promos, brand-new sets). User completes the
    // form from a pre-filled state instead of re-typing everything.
    if (body.cardName && setCode && localId) {
      const fallback = buildGeminiOnlyCard(body, setCode, localId, total, cardLang);
      return NextResponse.json({ bestMatch: fallback, candidates: [fallback] } satisfies EnrichResult);
    }

    // Strategy 6: nothing usable — caller falls back to bare OCR fields.
    return NextResponse.json({ bestMatch: null, candidates: [] } satisfies EnrichResult);
  } catch (error) {
    console.error('Enrich failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Enrich failed' },
      { status: 502 },
    );
  }
}

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
