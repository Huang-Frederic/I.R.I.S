import { NextResponse } from 'next/server';
import { searchBySetNumber } from '@/lib/api/tcgapi';
import { lookupById, toEnrichedCard, toTCGdexLang } from '@/lib/api/tcgdex';
import { parseSetNumber } from '@/lib/utils/parse-set-number';
import type { CardLanguage, EnrichResult } from '@/lib/types';

export const runtime = 'nodejs';

interface EnrichBody {
  /** Raw OCR text — used for the auto-enrich path on initial scan. */
  text?: string;
  /** Set code as printed on the card, e.g. "SV11W". */
  setCode?: string;
  /** Local id within the set, e.g. "136" (or "136/174", we keep just the left half). */
  localId?: string;
  /** Card language hint — drives which TCGdex catalog we query. */
  language?: CardLanguage;
}

/**
 * Two input shapes:
 *
 * 1. { setCode, localId, language? }  — direct TCGdex lookup. High precision.
 *    Wired to the "Re-rechercher TCG" button, which is the JP-friendly path.
 *
 * 2. { text }  — auto-enrich from raw OCR. Parses "<card>/<setSize>" and queries
 *    pokemontcg.io. Works for English / international printings indexed there;
 *    JP cards usually fail this path (use the button instead).
 */
export async function POST(request: Request) {
  let body: EnrichBody;
  try {
    body = (await request.json()) as EnrichBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body.setCode && body.localId) {
    return handleDirect(body);
  }

  if (body.text) {
    return handleText(body.text);
  }

  return NextResponse.json(
    { error: 'Provide either "text" (raw OCR) or "setCode"+"localId".' },
    { status: 400 },
  );
}

async function handleDirect(body: EnrichBody): Promise<Response> {
  const setCode = body.setCode!.trim();
  // Allow "136" or "136/174" — strip the right side if present.
  const localId = body.localId!.split('/')[0]?.trim() ?? '';
  if (!setCode || !localId) {
    return NextResponse.json({ error: 'setCode et localId sont requis' }, { status: 400 });
  }

  const lang = toTCGdexLang(body.language ?? 'EN');

  try {
    const card = await lookupById(setCode, localId, lang);
    if (!card) {
      const result: EnrichResult = { bestMatch: null, candidates: [] };
      return NextResponse.json(result);
    }
    const enriched = toEnrichedCard(card);
    return NextResponse.json({ bestMatch: enriched, candidates: [enriched] } satisfies EnrichResult);
  } catch (error) {
    console.error('TCGdex lookup failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Enrich failed' },
      { status: 502 },
    );
  }
}

async function handleText(rawText: string): Promise<Response> {
  const text = rawText.trim();
  const parsed = parseSetNumber(text);
  if (!parsed) {
    return NextResponse.json({ bestMatch: null, candidates: [] } satisfies EnrichResult);
  }

  try {
    const result = await searchBySetNumber({ cardNumber: parsed.card, setSize: parsed.total });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Enrich failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Enrich failed' },
      { status: 502 },
    );
  }
}
