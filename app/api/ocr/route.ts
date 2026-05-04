import { NextResponse } from 'next/server';
import { detectText } from '@/lib/api/vision';
import { extractCardFromImage } from '@/lib/api/gemini-vision';
import type { CardLanguage, OcrResult } from '@/lib/types';

export const runtime = 'nodejs';

const VALID_LANGUAGES = new Set<CardLanguage>(['JP', 'EN', 'FR', 'DE', 'IT', 'ES', 'KO', 'PT', 'ZH']);

/** Coerce Gemini's free-form language string into our CardLanguage enum. */
function normalizeGeminiLanguage(raw: string | null | undefined): CardLanguage | undefined {
  if (!raw) return undefined;
  const upper = raw.trim().toUpperCase() as CardLanguage;
  return VALID_LANGUAGES.has(upper) ? upper : undefined;
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('image');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing "image" file' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Try Gemini first if API key is set. The result always carries `usage` if
  // Gemini responded — even when the extraction itself failed (parse error,
  // incomplete payload). We propagate that to the client so the user sees the
  // tokens were burned even though Vision had to step in.
  const { extraction: geminiResult, usage: geminiUsage } = await extractCardFromImage(buffer);
  if (geminiResult) {
    const ocrResult: OcrResult = {
      text: `${geminiResult.card_name} | ${geminiResult.pokemon_name ?? ''} | ${geminiResult.set_code}-${geminiResult.set_number} | ${geminiResult.language}`,
      confidence:
        geminiResult.confidence === 'high'
          ? 0.95
          : geminiResult.confidence === 'medium'
            ? 0.75
            : 0.5,
      words: [], // Gemini doesn't give word-level boxes; empty is fine
      setNumberCandidate:
        geminiResult.set_total != null
          ? {
              card: geminiResult.set_number,
              total: String(geminiResult.set_total),
              raw: `${geminiResult.set_number}/${geminiResult.set_total}`,
            }
          : {
              card: geminiResult.set_number,
              total: '',
              raw: geminiResult.set_number,
            },
      setCodeCandidate: geminiResult.set_code,
      pokemonNumber: geminiResult.pokemon_number,
      pokemonNameFr: geminiResult.pokemon_name_fr,
      setName: geminiResult.set_name,
      setNameFr: geminiResult.set_name_fr,
      language: normalizeGeminiLanguage(geminiResult.language),
      cardName: geminiResult.card_name,
      pokemonName: geminiResult.pokemon_name,
      rarity: geminiResult.rarity,
      _usage: geminiResult._usage,
      _engine: 'gemini',
    };
    return NextResponse.json(ocrResult);
  }

  // Fall back to Google Vision. Attach Gemini usage if any tokens were burned
  // (parse-fail or incomplete payload cases) so the front can still show them.
  const base64 = buffer.toString('base64');
  try {
    const result = await detectText(base64);
    const ocrResult: OcrResult = {
      ...result,
      _usage: geminiUsage ?? undefined,
      _engine: 'vision',
    };
    return NextResponse.json(ocrResult);
  } catch (error) {
    console.error('OCR failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'OCR failed' },
      { status: 502 },
    );
  }
}
