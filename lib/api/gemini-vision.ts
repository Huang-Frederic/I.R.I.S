import 'server-only';

// Gemini pricing (paid tier, per 1M tokens). Empirically calibrated against
// actual GCP billing — input $2.00/M, output $5.00/M.
const PROMPT_TOKEN_ESTIMATE = 250; // base prompt only — no constraint list anymore
const COST_USD_PER_M_INPUT = 2.0;
const COST_USD_PER_M_OUTPUT = 5.0;
const USD_TO_EUR = 0.92;

const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const TIMEOUT_MS = 15000;

export interface GeminiUsage {
  tokens_in: number;
  tokens_out: number;
  /** Estimated image tokens (Gemini doesn't break this out separately). */
  tokens_image: number;
  cost_eur: number;
}

export interface GeminiCardExtraction {
  card_name: string;
  pokemon_name: string | null;
  /** 3-4 letter set abbreviation printed bottom-left of the card.
   *  e.g. "BRS" (Brilliant Stars), "LOR" (Lost Origin), "BKR" (BREAKpoint).
   *  Null when illegible (very old sets, blurred prints). */
  set_prefix: string | null;
  /** Pure-digit set number printed on the card.
   *  Null when Gemini detects a TG/GG/SV subseries prefix on the number
   *  (e.g. "TG03", "GG10") — these are stored differently in cardmarket and
   *  need a name-based picker lookup. */
  set_number: string | null;
  set_total: number | null;
  language: string; // 2-letter: JP, EN, FR, DE, IT, ES, PT, KO, ZH
  rarity: string | null;
  confidence: 'high' | 'medium' | 'low';

  pokemon_number: number | null; // National dex 1-1025, null for Trainers/Energy
  pokemon_name_fr: string | null; // French species name from Gemini training data
  /** English species name (e.g. "Charmander" for "Salamèche"/"ヒトカゲ"). Used
   *  by Strategy 1 to query cardmarket_products.card_prefix which is always EN.
   *  Null for non-Pokémon (Trainers/Energy) or unknown species. */
  pokemon_name_en: string | null;
  card_name_fr: string | null;    // French translation of full card name
  illustrator: string | null;     // Bottom credit line

  _usage?: GeminiUsage;
}

/**
 * Prod OCR prompt. Single source of truth — used by `app/api/ocr/route.ts` and
 * the bench scripts. Never copy-paste into another file — modify here only.
 *
 * English (Gemini handles English instructions more reliably than French).
 * No constraint list — relies entirely on the printed set_prefix code, which
 * is short (3-4 chars) and unambiguous when readable.
 */
export const BASE_PROMPT = `Read this Pokémon TCG card photo. Extract printed fields. NEVER guess — return null when illegible (except required fields below).

WHERE TO LOOK:
- card_name: top of the card, in the card's printed language.
- pokemon_name: same area, but strip suffixes (ex/V/VMAX/VSTAR/GX/EX). Null for Trainers/Energy/Stadium.
- set_prefix + set_number: bottom edge. On EN/FR/DE/IT/ES/PT cards they sit in a small block bottom-left near the set logo. On JP cards the prefix is printed adjacent to the number.
- illustrator: small "Illus." credit line at the very bottom.

SET PREFIX RULES:
- Latin-script cards (EN/FR/DE/IT/ES/PT) → ALWAYS 3-letter UPPERCASE codes (BRS, OBF, MEW, BKP, LOR, EVO, BKR, JTG, SCR, PRE, …). NEVER use a JP-style code on a Latin card — that's a hallucination.
- Japanese cards → mixed-case codes with letter suffixes (sv11W, s12a, sm8b, BW4, XY9, smp, xyp).
- Chinese (ZH) → "cs"-prefixed codes (cs4bc, cs1c).
- Korean → similar to JP or EN depending on the era.
- If you cannot read the prefix clearly, return null. Do NOT guess.

SET NUMBER — CRITICAL:
- ALWAYS extract the card-position digits. Strip leading zeros: "012/198" → "12", "088/SV-P" → "88", "199/198" → "199", "075" → "75".
- The number is printed bottom-right (or bottom-center on JP cards), often as "X/Y". X is ALWAYS digits (the card position) — extract those. Y can be a number (set total) OR a set marker (SV-P, RC, etc.) — IGNORE the part after the slash for set_number.
- Even when the printed format looks unusual (just "088", "088/SV-P", "088 SVP", etc.), the number you want is the FIRST digit run. Extract it.
- ⚠️ ONLY return null when the printed number ITSELF starts with TG or GG (e.g. "TG03", "GG10/GG70"). Those are Trainer/Galarian Gallery subseries that need a name-based lookup. Anything else: extract the digits.
- Promo cards (SWSH201, XY41, SM12 printed in the corner without slash): the full token IS the set_number ("SWSH201"), and set_prefix should be the promo set code (e.g. "SWSHP").

RARITY GUIDE — the small symbol next to the set_number on the bottom edge identifies it. Map carefully:

EN/FR/DE/IT/ES/PT cards (modern Sword & Shield onwards):
- ● (filled black circle) → "Common"
- ◆ (filled black diamond) → "Uncommon"
- ★ (filled black star, no flair) → "Rare" (regular non-holo)
- ★ with holographic foil on the artwork → "Holo Rare"
- ★ ★ (two stars) → "Double Rare" (typically Pokémon ex)
- ★ ★ ★ (three stars) → "Ultra Rare" (full-art ex / V / VMAX)
- ◇ ◇ ◇ (three diamonds) → "Art Rare"
- ◇ ◇ ◇ ◇ (four diamonds) → "Special Art Rare"
- ★ ★ ★ ★ (four stars / shiny) → "Hyper Rare" (gold/rainbow)
- "PROMO" word printed → "Promo"

Older sets (XY, SM era):
- "C" letter symbol → "Common"
- "U" letter → "Uncommon"
- "R" letter → "Rare"
- "RR" → "Double Rare"
- "SR" / "HR" / "UR" → "Secret Rare" / "Hyper Rare" / "Ultra Rare"

JP cards:
- Same symbols as EN. Plus: 「U」「R」「RR」「RRR」「SR」「SAR」「UR」printed near the number.
- 「C」(common), 「U」(uncommon), 「R」(rare), 「RR」(double rare), 「RRR」(ultra rare), 「AR」(art rare), 「SAR」(special art rare), 「UR」(hyper rare).

If you see ANY rarity symbol or letter, map it to the closest enum value. Only return null if the card has NO visible rarity marker (very old base set cards sometimes).

Allowed values: Common | Uncommon | Rare | Holo Rare | Double Rare | Ultra Rare | Art Rare | Special Art Rare | Secret Rare | Hyper Rare | Promo | Other

SCHEMA:
{
  "card_name":      "<top name as printed, with suffix e.g. 'Charizard ex'>",
  "pokemon_name":   "<species without suffix, e.g. 'Charizard'. null for non-Pokémon>",
  "pokemon_number": <national dex 1-1025, null for Trainers/Energy/Stadium>,
  "pokemon_name_fr":"<French species name e.g. 'Dracaufeu', null if unknown or non-Pokémon>",
  "pokemon_name_en":"<English species name e.g. 'Charizard' for 'Dracaufeu'/'リザードン'. Required when pokemon_number is set — used to query our English-only product DB. null for non-Pokémon>",
  "card_name_fr":   "<French translation of full card_name e.g. 'Dracaufeu ex'. null if already FR or unknown>",
  "set_prefix":     "<short code e.g. 'BRS', null if illegible>",
  "set_number":     "<digits only e.g. '12', null for TG/GG/SV/SVE/RC subseries>",
  "set_total":      <denominator e.g. 198, null if not visible>,
  "language":       "<JP|EN|FR|DE|IT|ES|PT|KO|ZH>",
  "rarity":         "<see RARITY GUIDE below — null only when truly invisible/missing>",
  "illustrator":    "<artist credit e.g. 'Ryuta Fuse', null if illegible>",
  "confidence":     "<high|medium|low>"
}`;

/**
 * Returns the prompt. No constraint list — kept async for the bench scripts
 * that already `await buildPrompt()`. May add per-call dynamic context here
 * later if useful.
 */
export async function buildPrompt(): Promise<string> {
  return BASE_PROMPT;
}

/**
 * Flash Preview occasionally ignores responseMimeType and prepends prose
 * ("Here is the JSON:" / "```json"). Strip everything outside the first
 * balanced `{...}` so JSON.parse never sees that noise.
 */
function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return text;
  return text.slice(start, end + 1);
}

/** Coerce "null" / "undefined" / "n/a" / empty / whitespace to actual null.
 *  Gemini sometimes emits the literal string "null" instead of JSON null. */
export function cleanNull(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (!t) return null;
  if (/^(null|undefined|n\/?a|none)$/i.test(t)) return null;
  return t;
}

/**
 * Strip the dash some Gemini outputs insert between Pokémon name and ex/V/etc.
 * "Aquali-ex" → "Aquali ex". TCG official + Cardmarket + LimitlessTCG all use
 * spaces — normalize to space for matching.
 */
export function normalizeSuffixDash(s: string | null): string | null {
  if (!s) return s;
  return s.replace(/-(ex|EX|GX|V|VMAX|VSTAR|V-?UNION|BREAK|LEGEND)\b/g, ' $1');
}

export const SCHEMA = {
  type: 'object',
  properties: {
    card_name: { type: 'string' },
    pokemon_name: { type: 'string' },
    pokemon_number: { type: 'integer' },
    pokemon_name_fr: { type: 'string' },
    pokemon_name_en: { type: 'string' },
    card_name_fr: { type: 'string' },
    set_prefix: { type: 'string' },
    set_number: { type: 'string' },
    set_total: { type: 'integer' },
    language: { type: 'string' },
    rarity: { type: 'string' },
    illustrator: { type: 'string' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  // set_prefix and set_number can legitimately be null (illegible code, TG/GG)
  // — kept out of required so Gemini doesn't hallucinate a value.
  required: ['card_name', 'language', 'confidence'],
};

/**
 * Result of a Gemini vision call. `extraction` is null when the call failed
 * (missing key, network error, parse failure). `usage` is non-null whenever
 * Gemini responded with usageMetadata — including parse-failure cases.
 */
export interface GeminiResult {
  extraction: GeminiCardExtraction | null;
  usage: GeminiUsage | null;
}

export async function extractCardFromImage(
  imageBuffer: Buffer,
): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { extraction: null, usage: null };

  const base64 = imageBuffer.toString('base64');
  const prompt = await buildPrompt();
  try {
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: 'image/jpeg', data: base64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: SCHEMA,
          maxOutputTokens: 300,
          // Disable reasoning — OCR extraction is structural, not reasoning.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text();
      console.warn(`Gemini ${response.status}: ${body.slice(0, 200)}`);
      return { extraction: null, usage: null };
    }

    interface GeminiResp {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    }
    const data = (await response.json()) as GeminiResp;

    let usage: GeminiUsage | null = null;
    const meta = data.usageMetadata;
    if (meta && typeof meta.promptTokenCount === 'number' && typeof meta.candidatesTokenCount === 'number') {
      const tokens_in = meta.promptTokenCount;
      const tokens_out = meta.candidatesTokenCount;
      const tokens_image = Math.max(0, tokens_in - PROMPT_TOKEN_ESTIMATE);
      const cost_usd = (tokens_in * COST_USD_PER_M_INPUT + tokens_out * COST_USD_PER_M_OUTPUT) / 1_000_000;
      const cost_eur = cost_usd * USD_TO_EUR;
      usage = { tokens_in, tokens_out, tokens_image, cost_eur };
      console.log(`[Gemini] ${tokens_in}in / ${tokens_out}out / ${tokens_image}img — €${cost_eur.toFixed(6)}`);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { extraction: null, usage };

    let parsed: Partial<GeminiCardExtraction>;
    try {
      parsed = JSON.parse(extractJsonObject(text)) as Partial<GeminiCardExtraction>;
    } catch (parseErr) {
      console.warn(
        `Gemini parse failed (${parseErr instanceof Error ? parseErr.message : 'unknown'}). Raw: ${JSON.stringify(text).slice(0, 500)}`,
      );
      return { extraction: null, usage };
    }

    // card_name + language + confidence are the only hard requirements.
    if (!parsed.card_name || !parsed.language || !parsed.confidence) {
      console.warn('Gemini returned incomplete data:', parsed);
      return { extraction: null, usage };
    }

    const extraction: GeminiCardExtraction = {
      card_name: normalizeSuffixDash(parsed.card_name) ?? parsed.card_name,
      pokemon_name: normalizeSuffixDash(parsed.pokemon_name || null),
      set_prefix: cleanNull(parsed.set_prefix),
      set_number: parsed.set_number
        ? String(parsed.set_number).replace(/^0+/, '') || '0'
        : null,
      set_total: parsed.set_total ?? null,
      language: parsed.language,
      rarity: parsed.rarity || null,
      confidence: parsed.confidence,
      pokemon_number:
        typeof parsed.pokemon_number === 'number' &&
        Number.isFinite(parsed.pokemon_number) &&
        parsed.pokemon_number >= 1 &&
        parsed.pokemon_number <= 1025
          ? parsed.pokemon_number
          : null,
      pokemon_name_fr: normalizeSuffixDash(cleanNull(parsed.pokemon_name_fr)),
      pokemon_name_en: normalizeSuffixDash(cleanNull(parsed.pokemon_name_en)),
      card_name_fr: normalizeSuffixDash(cleanNull(parsed.card_name_fr)),
      illustrator: cleanNull(parsed.illustrator),
      _usage: usage ?? undefined,
    };
    return { extraction, usage };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('Gemini extraction failed:', msg);
    return { extraction: null, usage: null };
  }
}
