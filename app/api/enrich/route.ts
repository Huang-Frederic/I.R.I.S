import { NextResponse } from 'next/server';
import { searchBySetNumber } from '@/lib/api/tcgapi';
import {
  findCardByTotalAndLocalId,
  lookupById,
  toEnrichedCard,
  toTCGdexLang,
  type TCGdexCard,
} from '@/lib/api/tcgdex';
import { parseSetNumber } from '@/lib/utils/parse-set-number';
import type { CardLanguage, EnrichResult } from '@/lib/types';

export const runtime = 'nodejs';

interface EnrichBody {
  /** Raw OCR text — only used when no structured fields are provided. */
  text?: string;
  /** Set code as printed on the card, e.g. "SV11W". Optional — total+localId can resolve without it. */
  setCode?: string;
  /** Local id within the set, e.g. "111" (or "111/086", we keep just the left half). */
  localId?: string;
  /** Set total — number of base cards in the set, e.g. 86 (or "086"). */
  total?: string | number;
  /** Card language hint — drives which TCGdex catalog we query. */
  language?: CardLanguage;
}

/**
 * Resolution strategy (TCGdex-first, with progressive fallbacks):
 *
 *   1. {setCode, localId, language}  → direct `/cards/<setCode>-<localId>` lookup.
 *      Most precise; works if the user (or smart extraction) has both pieces.
 *
 *   2. {total, localId, language}    → list TCGdex sets, narrow to those whose
 *      cardCount.official matches `total`, try `<set.id>-<localId>` against
 *      each. Robust to OCR errors on the set code (the killer feature for JP
 *      cards where Vision routinely reads "sv1W" as "Miyanose" or worse).
 *
 *   3. {text}                        → parse the raw OCR text for "<X>/<Y>",
 *      then run strategy 2 with the parsed total + localId. Falls back to
 *      pokemontcg.io if TCGdex misses (kept for English / older catalogs).
 *
 * Any strategy returning a hit is wrapped as { bestMatch, candidates: [match] }.
 */
export async function POST(request: Request) {
  let body: EnrichBody;
  try {
    body = (await request.json()) as EnrichBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { setCode, localId, total, language } = normalize(body);

  // Nothing usable at all
  if (!localId && !body.text) {
    return NextResponse.json(
      { error: 'Provide either "text" or "localId" (with optional setCode/total).' },
      { status: 400 },
    );
  }

  const lang = toTCGdexLang(language ?? 'EN');

  try {
    let card: TCGdexCard | null = null;

    // Strategy 1: setCode + localId → direct lookup
    if (setCode && localId) {
      card = await lookupById(setCode, localId, lang);
    }

    // Strategy 2: total + localId → narrow by set total, try each candidate
    if (!card && total != null && localId) {
      card = await findCardByTotalAndLocalId(total, localId, lang);
    }

    if (card) {
      const enriched = toEnrichedCard(card);
      return NextResponse.json({
        bestMatch: enriched,
        candidates: [enriched],
      } satisfies EnrichResult);
    }

    // Strategy 3 fallback: pokemontcg.io text search
    if (body.text) {
      const parsed = parseSetNumber(body.text);
      if (parsed) {
        const result = await searchBySetNumber({
          cardNumber: parsed.card,
          setSize: parsed.total,
        });
        if (result.bestMatch) {
          return NextResponse.json(result);
        }
      }
    }

    return NextResponse.json({ bestMatch: null, candidates: [] } satisfies EnrichResult);
  } catch (error) {
    console.error('Enrich failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Enrich failed' },
      { status: 502 },
    );
  }
}

/**
 * Pull the structured fields out of the request body, accepting either:
 *   - explicit { setCode, localId, total, language }
 *   - implicit: localId="111/086" with `/` → split to localId + total
 *   - text-only: parse "<X>/<Y>" out of the OCR string
 *
 * After this, the handler can branch on (setCode?, localId?, total?) without
 * re-parsing.
 */
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
