/**
 * Test bench Gemini — measure Gemini 2.0 Flash's vision accuracy on real card images.
 *
 * Sends each card photo to Gemini with a structured JSON-only prompt requesting
 * card_name, pokemon_name, set_code, set_number, set_total, language, rarity.
 * Compares against ground truth parsed from the filename.
 *
 * Free tier: 1500 req/day, 15 RPM. Our 30-card bench costs nothing.
 *
 * Usage:
 *   npx tsx scripts/test-bench-gemini.ts
 *   GEMINI_MODEL=gemini-2.0-flash-exp npx tsx scripts/test-bench-gemini.ts  # alt model
 *
 * Outputs results/test-bench-gemini.csv.
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// Load .env.local manually (no dotenv dependency)
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-flash-latest';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_DIM = 1600;
const RATE_LIMIT_MS = Number(process.env.RATE_LIMIT_MS ?? 7000); // Default 7s = ~8 RPM safety margin

// ---------------------------------------------------------------------------
// Ground truth parser — extracts {set}_{localId}_{rarity} from filename
// ---------------------------------------------------------------------------

interface GroundTruth {
  filename: string;
  set: string;
  localId: string;
  rarity: string;
}

function parseFilename(filename: string): GroundTruth | null {
  const base = filename.replace(/\.[^.]+$/, '');
  const parts = base.split('_');
  if (parts.length < 2) return null;
  return {
    filename,
    set: parts[0],
    localId: parts[1],
    rarity: parts[2] ?? '',
  };
}

// ---------------------------------------------------------------------------
// Image resize (downscale before upload — Gemini accepts large but smaller is faster)
// ---------------------------------------------------------------------------

async function resizeToBase64(filepath: string): Promise<string> {
  const buf = await sharp(filepath)
    .resize(MAX_DIM, MAX_DIM, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return buf.toString('base64');
}

// ---------------------------------------------------------------------------
// Gemini API call with structured-JSON prompt
// ---------------------------------------------------------------------------

interface GeminiExtraction {
  card_name: string | null;       // Name as printed on the card, in original language
  pokemon_name: string | null;    // Bare species name (no ex/V/VMAX suffix)
  set_code: string | null;        // e.g. "SV11W", "BW5", "SM8b"
  set_number: string | null;      // Local id, e.g. "12", "111", "27"
  set_total: number | null;       // Printed denominator, e.g. 86, 172, 150
  language: string | null;        // 2-letter code: JP, EN, FR, DE, IT, ES, PT, KO, ZH
  rarity: string | null;          // Best-effort: Common, Rare, Double Rare, etc.
  confidence: 'high' | 'medium' | 'low' | null; // Model's self-assessment
  notes: string | null;           // Free-text if anything unusual
}

const PROMPT = `You are looking at a Pokémon Trading Card Game card photo. Extract the following information AS PRINTED ON THE CARD (don't translate or normalize):

Return a JSON object with these exact keys:
- "card_name": the full card name as printed (e.g. "ピカチュウ", "Charizard ex", "Pikachu VMAX")
- "pokemon_name": the Pokémon species name only, no suffix (e.g. "ピカチュウ" stripped of "ex"/"V"/"VMAX"). Null for non-Pokémon cards (Trainers/Energies).
- "set_code": the small alphanumeric code printed in the bottom-left/right of the card (e.g. "SV11W", "BW5", "SM8b", "XY8b", "S4a"). Look for short codes like "sv1a", "swsh4", "BW8". Case-sensitive — match what you see.
- "set_number": the card number as printed before the slash (e.g. "12" from "012/086", "111" from "111/172"). Strip leading zeros.
- "set_total": the number AFTER the slash in "<n>/<total>" (e.g. 86 from "012/086", 172 from "111/172").
- "language": 2-letter code matching the card's printed language (JP for Japanese, EN for English, FR for French, DE German, IT Italian, ES Spanish, PT Portuguese, KO Korean, ZH Chinese).
- "rarity": one of "Common", "Uncommon", "Rare", "Holo Rare", "Double Rare", "Ultra Rare", "Art Rare", "Special Art Rare", "Secret Rare", "Hyper Rare", "Promo", or "Other". Best effort from the rarity symbol shown.
- "confidence": "high" if you're very sure, "medium" if some fields are guessed, "low" if the image is unclear or you don't recognize the card.
- "notes": null normally; use ONLY if something is genuinely unusual (image cropped, multiple cards visible, blurry).

Return ONLY the JSON object, no markdown, no explanation.`;

async function callGemini(base64Image: string): Promise<{ raw: string; parsed: GeminiExtraction | null; error?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set in .env.local');

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: PROMPT },
          { inline_data: { mime_type: 'image/jpeg', data: base64Image } },
        ],
      }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    return { raw: '', parsed: null, error: `HTTP ${response.status}: ${body.slice(0, 300)}` };
  }

  interface GeminiResponse {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    error?: { message?: string };
  }

  const data = (await response.json()) as GeminiResponse;
  if (data.error?.message) return { raw: '', parsed: null, error: data.error.message };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) return { raw: '', parsed: null, error: 'Empty response' };

  try {
    const parsed = JSON.parse(text) as GeminiExtraction;
    return { raw: text, parsed };
  } catch (e) {
    return { raw: text, parsed: null, error: `JSON parse: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ---------------------------------------------------------------------------
// CSV output
// ---------------------------------------------------------------------------

interface BenchRow {
  filename: string;
  gt_set: string;
  gt_localId: string;
  gt_rarity: string;
  gemini_card_name: string;
  gemini_pokemon_name: string;
  gemini_set_code: string;
  gemini_set_number: string;
  gemini_set_total: string;
  gemini_language: string;
  gemini_rarity: string;
  gemini_confidence: string;
  gemini_notes: string;
  set_match: string;       // YES/NO/CASE-INSENSITIVE-YES
  localId_match: string;
  combined_match: string;
  error: string;
}

const CSV_HEADERS: (keyof BenchRow)[] = [
  'filename', 'gt_set', 'gt_localId', 'gt_rarity',
  'gemini_card_name', 'gemini_pokemon_name', 'gemini_set_code', 'gemini_set_number',
  'gemini_set_total', 'gemini_language', 'gemini_rarity', 'gemini_confidence', 'gemini_notes',
  'set_match', 'localId_match', 'combined_match', 'error',
];

function escapeCSV(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY not set in .env.local');
    console.error('Get a free key at https://aistudio.google.com/app/apikey');
    process.exit(1);
  }

  const dir = path.resolve(__dirname, '../cards_assets');
  if (!fs.existsSync(dir)) {
    console.error('cards_assets/ directory not found');
    process.exit(1);
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .sort();

  console.log(`Found ${files.length} images. Model: ${GEMINI_MODEL}`);
  console.log(`Rate limit: ${RATE_LIMIT_MS}ms between requests (free tier = 15 RPM)\n`);

  const rows: BenchRow[] = [];
  let total = 0;
  let setMatchCount = 0;
  let localIdMatchCount = 0;
  let combinedMatchCount = 0;

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const gt = parseFilename(filename);
    if (!gt) {
      console.log(`[${i + 1}/${files.length}] SKIP ${filename} — can't parse filename`);
      continue;
    }

    total++;
    process.stdout.write(`[${i + 1}/${files.length}] ${filename} ... `);

    try {
      const base64 = await resizeToBase64(path.join(dir, filename));
      const { parsed, error } = await callGemini(base64);

      if (!parsed) {
        console.log(`ERROR: ${error ?? 'parse failed'}`);
        rows.push({
          filename, gt_set: gt.set, gt_localId: gt.localId, gt_rarity: gt.rarity,
          gemini_card_name: '', gemini_pokemon_name: '', gemini_set_code: '',
          gemini_set_number: '', gemini_set_total: '', gemini_language: '',
          gemini_rarity: '', gemini_confidence: '', gemini_notes: '',
          set_match: 'ERROR', localId_match: 'ERROR', combined_match: 'ERROR',
          error: (error ?? 'parse failed').slice(0, 120),
        });
      } else {
        const detSet = (parsed.set_code ?? '').trim();
        const detNum = (parsed.set_number ?? '').toString().trim().replace(/^0+/, '') || '0';
        const gtNum = gt.localId.replace(/^0+/, '') || '0';
        const setMatch = detSet.toLowerCase() === gt.set.toLowerCase() ? 'YES' : 'NO';
        const localIdMatch = detNum === gtNum ? 'YES' : 'NO';
        const combined = setMatch === 'YES' && localIdMatch === 'YES' ? 'YES' : 'NO';

        if (setMatch === 'YES') setMatchCount++;
        if (localIdMatch === 'YES') localIdMatchCount++;
        if (combined === 'YES') combinedMatchCount++;

        rows.push({
          filename, gt_set: gt.set, gt_localId: gt.localId, gt_rarity: gt.rarity,
          gemini_card_name: parsed.card_name ?? '',
          gemini_pokemon_name: parsed.pokemon_name ?? '',
          gemini_set_code: detSet,
          gemini_set_number: parsed.set_number?.toString() ?? '',
          gemini_set_total: parsed.set_total?.toString() ?? '',
          gemini_language: parsed.language ?? '',
          gemini_rarity: parsed.rarity ?? '',
          gemini_confidence: parsed.confidence ?? '',
          gemini_notes: parsed.notes ?? '',
          set_match: setMatch, localId_match: localIdMatch, combined_match: combined,
          error: '',
        });

        const status = combined === 'YES' ? 'OK  ' : 'MISS';
        console.log(`${status} | set:${setMatch} id:${localIdMatch} | ${detSet} ${detNum} ${parsed.card_name ?? ''} (${parsed.confidence ?? '?'})`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`EXCEPTION: ${msg}`);
      rows.push({
        filename, gt_set: gt.set, gt_localId: gt.localId, gt_rarity: gt.rarity,
        gemini_card_name: '', gemini_pokemon_name: '', gemini_set_code: '',
        gemini_set_number: '', gemini_set_total: '', gemini_language: '',
        gemini_rarity: '', gemini_confidence: '', gemini_notes: '',
        set_match: 'ERROR', localId_match: 'ERROR', combined_match: 'ERROR',
        error: msg.slice(0, 120),
      });
    }

    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }

  // Write CSV
  const outDir = path.resolve(__dirname, '../results');
  fs.mkdirSync(outDir, { recursive: true });
  const csvPath = path.join(outDir, 'test-bench-gemini.csv');
  const csvLines = [
    CSV_HEADERS.join(','),
    ...rows.map((row) => CSV_HEADERS.map((h) => escapeCSV(row[h])).join(',')),
  ];
  fs.writeFileSync(csvPath, csvLines.join('\n') + '\n', 'utf-8');

  console.log(`\n${'='.repeat(70)}`);
  console.log(`Gemini ${GEMINI_MODEL} results on ${total} cards:`);
  console.log(`  Set code match:   ${setMatchCount}/${total} (${((setMatchCount / total) * 100).toFixed(1)}%)`);
  console.log(`  Local ID match:   ${localIdMatchCount}/${total} (${((localIdMatchCount / total) * 100).toFixed(1)}%)`);
  console.log(`  Combined match:   ${combinedMatchCount}/${total} (${((combinedMatchCount / total) * 100).toFixed(1)}%)`);
  console.log(`CSV: ${csvPath}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`\nFor comparison: current Vision+catalog pipeline = 19/30 (63%) measured.`);
  console.log(`Gemini Flash combined match ${combinedMatchCount}/30 → ` +
    (combinedMatchCount >= 27 ? 'EXCELLENT (≥90%)' :
     combinedMatchCount >= 24 ? 'GOOD (≥80%)' :
     combinedMatchCount >= 20 ? 'OK but not a huge win' :
     'Worse than current — Gemini may not be the right model'));
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
