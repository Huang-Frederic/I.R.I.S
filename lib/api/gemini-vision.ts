import 'server-only';

const GEMINI_MODEL = 'gemini-3-flash-preview';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const TIMEOUT_MS = 15000;

export interface GeminiCardExtraction {
  card_name: string;
  pokemon_name: string | null;
  set_code: string;
  set_number: string;
  set_total: number | null;
  language: string; // 2-letter code: JP, EN, FR, DE, IT, ES, PT, KO, ZH
  rarity: string | null;
  confidence: 'high' | 'medium' | 'low';
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
  "confidence": "high|medium|low"
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
  },
  required: ['card_name', 'set_code', 'set_number', 'language', 'confidence'],
};

/**
 * Send a card image to Gemini 3 Flash Preview and extract structured fields.
 * Returns null on API error, timeout, or low-confidence response — caller
 * should fall back to Google Vision in that case.
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
    }
    const data = (await response.json()) as GeminiResp;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

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
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('Gemini extraction failed:', msg);
    return null;
  }
}
