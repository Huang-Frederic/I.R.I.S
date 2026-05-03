import { NextResponse } from 'next/server';
import { detectText } from '@/lib/api/vision';
import { extractCardFromImage } from '@/lib/api/gemini-vision';
import type { OcrResult } from '@/lib/types';

export const runtime = 'nodejs';

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

  // Try Gemini first if API key is set
  const geminiResult = await extractCardFromImage(buffer);
  if (geminiResult) {
    // Map Gemini extraction to OcrResult shape
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
      _usage: geminiResult._usage,
    };
    return NextResponse.json(ocrResult);
  }

  // Fall back to Google Vision
  const base64 = buffer.toString('base64');
  try {
    const result = await detectText(base64);
    return NextResponse.json(result);
  } catch (error) {
    console.error('OCR failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'OCR failed' },
      { status: 502 },
    );
  }
}
