import 'server-only';

// Gemini 3.1 Flash Lite Preview pricing (paid tier, per 1M tokens, source:
// https://ai.google.dev/gemini-api/docs/pricing — verified 2026-05).
// Bench 5/5 same as gemini-3-flash-preview at -43% cost / -35% latency.
const PROMPT_TOKEN_ESTIMATE = 360; // mesuré post-multilang prompt rewrite (avant: 220 pour le prompt court JP-only)
const COST_USD_PER_M_INPUT = 0.25;  // text / image / video
const COST_USD_PER_M_OUTPUT = 1.50; // including thinking tokens (we set thinkingBudget=0 → 0 charged)
const USD_TO_EUR = 0.92;

const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const TIMEOUT_MS = 15000;

export interface GeminiUsage {
  tokens_in: number;
  tokens_out: number;
  /** Estimated image tokens (Gemini doesn't break this out, derived = promptTokenCount - PROMPT_TOKEN_ESTIMATE). */
  tokens_image: number;
  cost_eur: number;
}

export interface GeminiCardExtraction {
  card_name: string;
  pokemon_name: string | null;
  set_code: string;
  set_number: string;
  set_total: number | null;
  language: string; // 2-letter code: JP, EN, FR, DE, IT, ES, PT, KO, CN
  rarity: string | null;
  confidence: 'high' | 'medium' | 'low';

  // Pokédex info from Gemini training data
  pokemon_number: number | null; // National dex 1-1025, null for non-Pokémon cards (Trainers/Energies)
  pokemon_name_fr: string | null; // French species name, e.g. "Gruikui" for "チャオブー"
  /** French translation of the FULL card name (incl. suffixes for Pokémon, OR the
   *  Trainer/Energy/Stadium name like "Le Plan de N" for "Nの筋書き"). Null when
   *  the card is already FR or Gemini doesn't know a confident translation. */
  card_name_fr: string | null;

  // Set translation
  set_name: string | null; // Set name as printed on card (in card's language)
  set_name_fr: string | null; // French translation of set name from training data

  // Illustrator credit printed at the bottom of the card. Unique per card +
  // language combination — useful as a disambiguation signal when set_code is
  // ambiguous (currently displayed in the OCR debug snippet; future versions
  // could match it against catalog if we re-scrape with that field).
  illustrator: string | null;

  _usage?: GeminiUsage;
}

const PROMPT = `Lis une carte Pokémon JCC. Extrais ce qui est IMPRIMÉ sur la carte, ne traduis pas vers une autre langue. NE DEVINE PAS — si non lisible, mets null (sauf champs requis).

LOCALISATION :
- Numéro XXX/YYY (ex 012/086, 199/198, 175/175) : en bas, souvent à droite. Sans zéros initiaux dans la sortie.
- set_code : court code alphanumérique imprimé en bas, soit collé au numéro (cartes JP), soit dans un bloc séparé en bas-gauche près du logo de set (cartes EN/FR/DE/IT/ES/PT modernes).
- Nom du Pokémon : en HAUT.

CODES DE SET PAR LANGUE — extrais ce qui est imprimé, JAMAIS l'équivalent d'une autre langue :
- JP : codes mixed-case avec suffixes lettres → sv11W, s12a, BW4, sm8b, sv8a, XY9, smp, xyp
- EN : codes uppercase 3 lettres → OBF, MEW, JTG, SCR, PRE, PAL, BKP, BKT, AOR, STS, GEN, FCO, EVO, SVI
- FR/DE/IT/ES/PT : MÊMES codes uppercase 3 lettres que EN (BKP, OBF, MEW, SCR, PRE, JTG, …)
- CN (chinois) : codes 'cs'+suffixe → cs4bc, cs4aC, cs1c, csm1a (équivalent ZH)
- KO : codes similaires à JP ou EN selon la série

⚠️ ANTI-PIÈGE : si la carte est en alphabet latin (Pikachu, Dracaufeu, …), le set_code est OBLIGATOIREMENT en format EN/FR (3 lettres UPPERCASE comme BKP, OBF, MEW). N'INVENTE PAS de code JP (XY9, sv11W, BW5) sur une carte FR/EN — ce serait une hallucination.

{
  "card_name": "<nom haut, ex 'チャオブー' (JP), 'Pikachu ex' (EN), 'Dracaufeu ex' (FR)>",
  "pokemon_name": "<sans suffixe ex/V/VMAX, ex 'Pikachu' / 'Dracaufeu'>",
  "set_code": "<code exact tel qu'imprimé, casse sensible>",
  "set_number": "<XXX sans zéros initiaux: '12' pas '012'>",
  "set_total": <YYY ou null>,
  "language": "<JP|EN|FR|KO|CN (utilise CN pour chinois, pas ZH)>",
  "rarity": "<Common|Uncommon|Rare|Holo Rare|Double Rare|Ultra Rare|Art Rare|Special Art Rare|Secret Rare|Hyper Rare|Promo|Other ou null>",
  "confidence": "high|medium|low",
  "pokemon_number": <national dex 1-1025 si Pokémon, null pour Trainer/Energy/Stadium>,
  "pokemon_name_fr": "<nom FR standard (ex 'Gruikui', 'Dracaufeu'), null si non-Pokémon ou incertain>",
  "card_name_fr": "<traduction FR du nom COMPLET de la carte (ex 'Dracaufeu ex' pour 'リザードンex', 'Le Plan de N' pour 'Nの筋書き', 'Marnie' identique). Null si carte d\\u00e9j\\u00e0 en FR ou si traduction incertaine>",
  "set_name": "<nom extension imprimé (ex 'White Flare', 'BREAKpoint'), null si invisible>",
  "set_name_fr": "<traduction FR (ex 'Combat de Maîtres', 'Rupture Turbo'), null si incertain>",
  "illustrator": "<crédit illustrateur en bas de carte (ex 'Ryuta Fuse', 'YASHIRO Nanaco', 'kirisAki'), null si illisible>"
}`;

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
 *  Gemini sometimes emits the literal string "null" instead of the JSON null
 *  for fields it can't fill — without this, downstream code happily formats
 *  things like `"null (Nの筋書き)"` because the string is truthy. */
function cleanNull(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (!t) return null;
  if (/^(null|undefined|n\/?a|none)$/i.test(t)) return null;
  return t;
}

const SCHEMA = {
  type: 'object',
  properties: {
    card_name: { type: 'string' },
    pokemon_name: { type: 'string' }, // can be empty string if non-Pokémon
    set_code: { type: 'string' },
    set_number: { type: 'string' },
    set_total: { type: 'integer' },
    language: { type: 'string' },
    rarity: { type: 'string' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    pokemon_number: { type: 'integer' },
    pokemon_name_fr: { type: 'string' },
    card_name_fr: { type: 'string' },
    set_name: { type: 'string' },
    set_name_fr: { type: 'string' },
    illustrator: { type: 'string' },
  },
  required: ['card_name', 'set_code', 'set_number', 'language', 'confidence'],
};

/**
 * Result of a Gemini vision call. `extraction` is null when the call failed
 * (missing key, network error, parse failure, incomplete payload). `usage`
 * is non-null whenever Gemini actually responded with usageMetadata —
 * including parse-failure cases where we burned tokens but couldn't read the
 * JSON. Callers can then attribute the cost even when falling back to Vision.
 */
export interface GeminiResult {
  extraction: GeminiCardExtraction | null;
  usage: GeminiUsage | null;
}

/**
 * Send a card image to Gemini 3 Flash Preview and extract structured fields.
 * Returns `{ extraction: null, usage: null }` on configuration errors and
 * pre-response failures. Returns `{ extraction: null, usage: <tokens> }` on
 * post-response failures so the caller can still surface cost.
 *
 * Low-confidence responses are returned as-is — the UI surfaces a warning
 * via the confidence threshold check, but data still flows. We do NOT fall
 * back to Vision on low confidence (Gemini-low > Vision-anything per bench).
 */
export async function extractCardFromImage(
  imageBuffer: Buffer,
): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { extraction: null, usage: null };

  const base64 = imageBuffer.toString('base64');
  try {
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: 'image/jpeg', data: base64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: SCHEMA,
          maxOutputTokens: 300,
          // Gemini 3 Flash is a reasoning model — by default it burns the
          // output budget on internal "thinking" tokens before producing the
          // JSON, hitting MAX_TOKENS with content: {}. OCR extraction is a
          // structural task that needs zero reasoning, so disable it entirely.
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

    // Extract usage FIRST so we can report it even on downstream failures.
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
      // Flash Preview occasionally returns prose-only ("Here is the JSON:") and
      // hits maxOutputTokens before producing the object. Log the full raw text
      // so we can diagnose recurring failures from the server logs.
      console.warn(
        `Gemini parse failed (${parseErr instanceof Error ? parseErr.message : 'unknown'}). Raw response: ${JSON.stringify(text).slice(0, 500)}`,
      );
      return { extraction: null, usage };
    }

    // Sanity check: must have set_code + set_number
    if (
      !parsed.card_name ||
      !parsed.set_code ||
      !parsed.set_number ||
      !parsed.language ||
      !parsed.confidence
    ) {
      console.warn('Gemini returned incomplete data:', parsed);
      return { extraction: null, usage };
    }

    const extraction: GeminiCardExtraction = {
      card_name: parsed.card_name,
      pokemon_name: parsed.pokemon_name || null,
      set_code: parsed.set_code,
      set_number: String(parsed.set_number).replace(/^0+/, '') || '0',
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
      pokemon_name_fr: cleanNull(parsed.pokemon_name_fr),
      card_name_fr: cleanNull(parsed.card_name_fr),
      set_name: cleanNull(parsed.set_name),
      set_name_fr: cleanNull(parsed.set_name_fr),
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
