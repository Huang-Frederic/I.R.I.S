import { NextResponse } from 'next/server';
import { detectText } from '@/lib/api/vision';
import { extractCardFromImage } from '@/lib/api/gemini-vision';
import type { CardLanguage, OcrResult } from '@/lib/types';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';
import { computeVisionCostEur } from '@/lib/utils/ocr-cost';
import { apiError, unauthorizedResponse, validationResponse } from '@/lib/utils/api-response';
import POKEMON_NAMES from '@/lib/data/pokemon-names.json';

export const runtime = 'nodejs';

const VALID_LANGUAGES = new Set<CardLanguage>(['JP', 'EN', 'FR', 'DE', 'IT', 'ES', 'KO', 'PT', 'ZH', 'CN']);

/**
 * Coerce Gemini's free-form language string into our CardLanguage enum.
 * Maps ZH → CN since Gemini still emits 'ZH' (per its prompt enum) but the
 * app standardized on 'CN' after the 2026-05-04 migration.
 */
function normalizeGeminiLanguage(raw: string | null | undefined): CardLanguage | undefined {
  if (!raw) return undefined;
  const upper = raw.trim().toUpperCase();
  if (upper === 'ZH' || upper === 'CN') return 'CN';
  return VALID_LANGUAGES.has(upper as CardLanguage) ? (upper as CardLanguage) : undefined;
}

async function logOcrUsage(input: {
  engine: 'gemini' | 'vision';
  tokens_in: number | null;
  tokens_out: number | null;
  cost_eur: number;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const service = createServiceClient();
    await service.from('ocr_usage_log').insert({
      engine: input.engine,
      tokens_in: input.tokens_in,
      tokens_out: input.tokens_out,
      cost_eur: input.cost_eur,
      user_id: user?.id ?? null,
    });
  } catch (err) {
    console.warn('[ocr_usage_log] insert failed (non-fatal):', err);
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return unauthorizedResponse();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return validationResponse('Invalid form data');
  }

  const file = formData.get('image');
  if (!(file instanceof File)) {
    return validationResponse('Missing "image" file');
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Try Gemini first if API key is set. The result always carries `usage` if
  // Gemini responded — even when the extraction itself failed (parse error,
  // incomplete payload). We propagate that to the client so the user sees the
  // tokens were burned even though Vision had to step in.
  const { extraction: geminiResult, usage: geminiUsage } = await extractCardFromImage(buffer);
  if (geminiResult) {
    // Pokémon name translations: NEVER trust Gemini's pokemon_name_fr /
    // pokemon_name_en — it hallucinates routinely (e.g. "Abo" for dex=3,
    // "Mew" for dex=5). The national dex number IS language-agnostic ground
    // truth, and we have a static dex → {fr,en,ja} map (lib/data/pokemon-names.json,
    // generated once from PokéAPI). Lookup is O(1), zero network, deterministic.
    if (geminiResult.pokemon_number) {
      const entry = (POKEMON_NAMES as Record<string, { fr: string; en: string; ja: string }>)[
        String(geminiResult.pokemon_number)
      ];
      if (entry) {
        if (entry.fr && entry.fr !== geminiResult.pokemon_name_fr) {
          console.log(
            `[ocr] override pokemon_name_fr "${geminiResult.pokemon_name_fr}" → "${entry.fr}" (dex=${geminiResult.pokemon_number})`,
          );
        }
        if (entry.en && entry.en !== geminiResult.pokemon_name_en) {
          console.log(
            `[ocr] override pokemon_name_en "${geminiResult.pokemon_name_en}" → "${entry.en}" (dex=${geminiResult.pokemon_number})`,
          );
        }
        if (entry.fr) geminiResult.pokemon_name_fr = entry.fr;
        if (entry.en) geminiResult.pokemon_name_en = entry.en;
      }
    }
    const setNumStr = geminiResult.set_number ?? '';
    const setPrefixStr = geminiResult.set_prefix ?? '';
    const ocrResult: OcrResult = {
      text: `${geminiResult.card_name} | ${geminiResult.pokemon_name ?? ''} | ${setPrefixStr}-${setNumStr} | ${geminiResult.language}`,
      confidence:
        geminiResult.confidence === 'high'
          ? 0.95
          : geminiResult.confidence === 'medium'
            ? 0.75
            : 0.5,
      words: [], // Gemini doesn't give word-level boxes; empty is fine
      setNumberCandidate:
        geminiResult.set_total != null && geminiResult.set_number
          ? {
              card: geminiResult.set_number,
              total: String(geminiResult.set_total),
              raw: `${geminiResult.set_number}/${geminiResult.set_total}`,
            }
          : {
              card: geminiResult.set_number, // null for TG/GG → triggers picker
              total: '',
              raw: geminiResult.set_number ?? '',
            },
      setCodeCandidate: geminiResult.set_prefix, // set_prefix doubles as the form's set code
      pokemonNumber: geminiResult.pokemon_number,
      pokemonNameFr: geminiResult.pokemon_name_fr,
      pokemonNameEn: geminiResult.pokemon_name_en,
      cardNameFr: geminiResult.card_name_fr,
      language: normalizeGeminiLanguage(geminiResult.language),
      cardName: geminiResult.card_name,
      pokemonName: geminiResult.pokemon_name,
      rarity: geminiResult.rarity,
      illustrator: geminiResult.illustrator,
      _usage: geminiResult._usage,
      _engine: 'gemini',
    };
    await logOcrUsage({
      engine: 'gemini',
      tokens_in: geminiResult._usage?.tokens_in ?? null,
      tokens_out: geminiResult._usage?.tokens_out ?? null,
      cost_eur: geminiResult._usage?.cost_eur ?? 0,
    });
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
    await logOcrUsage({
      engine: 'vision',
      tokens_in: null,
      tokens_out: null,
      cost_eur: computeVisionCostEur(1),
    });
    return NextResponse.json(ocrResult);
  } catch (error) {
    console.error('OCR failed:', error);
    return apiError('ocr_failed', {
      status: 502,
      message: error instanceof Error ? error.message : 'OCR failed',
    });
  }
}

