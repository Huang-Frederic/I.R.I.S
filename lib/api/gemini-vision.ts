import 'server-only';

// Gemini Flash Preview pricing (cf. spec §4.1).
const PROMPT_TOKEN_ESTIMATE = 300; // mesuré post-shortening (Task 3), ajuster si bench différe
const COST_USD_PER_M_INPUT = 0.075;
const COST_USD_PER_M_OUTPUT = 0.30;
const USD_TO_EUR = 0.92;

const GEMINI_MODEL = 'gemini-3-flash-preview';
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
  language: string; // 2-letter code: JP, EN, FR, DE, IT, ES, PT, KO, ZH
  rarity: string | null;
  confidence: 'high' | 'medium' | 'low';

  // Pokédex info from Gemini training data
  pokemon_number: number | null; // National dex 1-1025, null for non-Pokémon cards (Trainers/Energies)
  pokemon_name_fr: string | null; // French species name, e.g. "Gruikui" for "チャオブー"

  // Set translation
  set_name: string | null; // Set name as printed on card (in card's language)
  set_name_fr: string | null; // French translation of set name from training data

  _usage?: GeminiUsage;
}

const PROMPT = `Tu regardes la photo d'une carte Pokémon JCC. Extrais les informations imprimées sur la carte.

EN BAS DE LA CARTE (sous le texte d'attaque/description), une ligne en petit contient typiquement :
1. Nom de l'illustrateur (ex: "Illus. Tecziro")
2. Numéro de carte au format XXX/YYY (ex: "012/086", "111/172")
3. Code d'extension court (ex: "SV11W", "BW5", "sm8b", "XY8b") — minuscules/majuscules sensibles, lis exactement comme imprimé

EN HAUT DE LA CARTE : nom du Pokémon (en JP/EN/FR/etc selon la langue de la carte).

Retourne le JSON suivant. NE DEVINE PAS, lis ce qui est imprimé. Si tu ne peux pas lire un champ, mets null sauf pour les requis.

{
  "card_name": "<nom complet imprimé en haut, ex: 'チャオブー', 'Pikachu ex'>",
  "pokemon_name": "<nom Pokémon sans suffixe ex/V/VMAX, ex: 'チャオブー', 'Pikachu'>",
  "set_code": "<code extension exact, ex: 'SV11W', 'BW5n'>",
  "set_number": "<XXX du XXX/YYY, sans zéros initiaux: '12' pas '012'>",
  "set_total": <YYY integer ou null>,
  "language": "<JP|EN|FR|DE|IT|ES|PT|KO|ZH selon la langue imprimée>",
  "rarity": "<Common|Uncommon|Rare|Holo Rare|Double Rare|Ultra Rare|Art Rare|Special Art Rare|Secret Rare|Hyper Rare|Promo|Other ou null>",
  "confidence": "high|medium|low",
  "pokemon_number": <numéro national du Pokédex (1-1025) si c'est une carte Pokémon, null pour Trainers/Energies/Stadium/etc>,
  "pokemon_name_fr": "<nom français standard du Pokémon (ex: 'Gruikui' pour チャオブー / Tepig), null si non-Pokémon ou si tu n'es pas sûr du nom français>",
  "set_name": "<nom de l'extension tel qu'imprimé en bas de la carte si visible (ex: 'ホワイトフレア', 'White Flare', 'Battle Partners'), null si non visible>",
  "set_name_fr": "<nom français de cette extension (ex: 'Combat de Maîtres'), null si tu n'es pas sûr>"
}`;

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
    set_name: { type: 'string' },
    set_name_fr: { type: 'string' },
  },
  required: ['card_name', 'set_code', 'set_number', 'language', 'confidence'],
};

/**
 * Send a card image to Gemini 3 Flash Preview and extract structured fields.
 * Returns null on API error, timeout, missing API key, or incomplete response.
 *
 * Low-confidence responses are returned as-is — the UI surfaces a warning
 * via the confidence threshold check, but data still flows. We do NOT fall
 * back to Vision on low confidence (Gemini-low > Vision-anything per bench).
 */
export async function extractCardFromImage(
  imageBuffer: Buffer,
): Promise<GeminiCardExtraction | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

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
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text();
      console.warn(`Gemini ${response.status}: ${body.slice(0, 200)}`);
      return null;
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
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    // Extract usage if present. Best-effort — absent if API doesn't return it.
    let usage: GeminiUsage | undefined;
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

    const parsed = JSON.parse(text) as Partial<GeminiCardExtraction>;

    // Sanity check: must have set_code + set_number
    if (
      !parsed.card_name ||
      !parsed.set_code ||
      !parsed.set_number ||
      !parsed.language ||
      !parsed.confidence
    ) {
      console.warn('Gemini returned incomplete data:', parsed);
      return null;
    }

    return {
      card_name: parsed.card_name,
      pokemon_name: parsed.pokemon_name || null,
      set_code: parsed.set_code,
      set_number: String(parsed.set_number).replace(/^0+/, '') || '0',
      set_total: parsed.set_total ?? null,
      language: parsed.language,
      rarity: parsed.rarity || null,
      confidence: parsed.confidence,
      pokemon_number:
        typeof parsed.pokemon_number === 'number' && Number.isFinite(parsed.pokemon_number)
          ? parsed.pokemon_number
          : null,
      pokemon_name_fr: parsed.pokemon_name_fr || null,
      set_name: parsed.set_name || null,
      set_name_fr: parsed.set_name_fr || null,
      _usage: usage,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('Gemini extraction failed:', msg);
    return null;
  }
}
