// app/api/enrich/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  disambiguateByName,
  lookupByCode,
  lookupByTotal,
  rowToEnrichedCard,
} from '@/lib/api/tcg-catalog';
import {
  enrichWithFrenchNames,
  findCardsByTotalAndLocalId,
  listSets,
  lookupById as tcgdexLookupById,
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
        return NextResponse.json({
          bestMatch: rowToEnrichedCard(row),
          candidates: [rowToEnrichedCard(row)],
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
            bestMatch: rowToEnrichedCard(result.best),
            candidates: result.candidates.map(rowToEnrichedCard),
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
    if (body.text && localId) {
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
      return NextResponse.json({ bestMatch: enriched, candidates } satisfies EnrichResult);
    }

    // Strategy 4: nothing found
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
