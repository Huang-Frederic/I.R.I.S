/**
 * Test bench Claude Haiku 4.5 — measure Claude's vision accuracy on real card images.
 *
 * Sends each card photo to Claude Haiku 4.5 with a structured JSON-only prompt requesting
 * card_name, pokemon_name, set_code, set_number, set_total, language, rarity.
 * Compares against ground truth parsed from the filename.
 *
 * Tier 1: 50 RPM, $5 credits budgeted. 30-card bench ~1.5min.
 *
 * Usage:
 *   npx tsx scripts/test-bench-claude.ts
 *
 * Outputs results/test-bench-claude.csv.
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import Anthropic from '@anthropic-ai/sdk';

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

const client = new Anthropic(); // Reads ANTHROPIC_API_KEY from process.env by default
const MAX_DIM = 1600;
const RATE_LIMIT_MS = 1500; // 1.5s between requests (safety margin for Tier 1 50 RPM)

// ---------------------------------------------------------------------------
// Ground truth parser (same as test-bench.ts)
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
// Image resize (downscale before upload)
// ---------------------------------------------------------------------------

async function resizeToBase64(filepath: string): Promise<string> {
  const buf = await sharp(filepath)
    .resize(MAX_DIM, MAX_DIM, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return buf.toString('base64');
}

// ---------------------------------------------------------------------------
// Claude API call with structured-JSON output
// ---------------------------------------------------------------------------

interface ClaudeExtraction {
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
- "rarity": one of "Common", "Uncommon", "Rare", "Holo Rare", "Double Rare", "Ultra Rare", "Art Rare", "Special Art Rare", "Secret Rare", "Hyper Rare", "Promo", "Other". Best effort from the rarity symbol shown.
- "confidence": "high" if you're very sure, "medium" if some fields are guessed, "low" if the image is unclear or you don't recognize the card.
- "notes": null normally; use ONLY if something is genuinely unusual (image cropped, multiple cards visible, blurry).

Return ONLY the JSON object, no markdown, no explanation.`;

// Anthropic structured outputs don't accept the JSON Schema array-of-types
// syntax (`type: ["string", "null"]`). Use anyOf for nullable fields instead.
const NULLABLE_STRING = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const NULLABLE_INTEGER = { anyOf: [{ type: 'integer' }, { type: 'null' }] };

const SCHEMA = {
  type: 'object',
  properties: {
    card_name: { type: 'string' },
    pokemon_name: NULLABLE_STRING,
    set_code: { type: 'string' },
    set_number: { type: 'string' },
    set_total: NULLABLE_INTEGER,
    language: { type: 'string' },
    rarity: NULLABLE_STRING,
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    notes: NULLABLE_STRING,
  },
  required: ['card_name', 'set_code', 'set_number', 'language', 'confidence'],
  additionalProperties: false,
} as const;

async function callClaude(base64Image: string): Promise<{
  raw: string;
  parsed: ClaudeExtraction | null;
  error?: string;
  inputTokens: number;
  outputTokens: number;
}> {
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      output_config: {
        format: { type: 'json_schema', schema: SCHEMA },
      },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Image } },
          { type: 'text', text: PROMPT },
        ],
      }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return {
        raw: '',
        parsed: null,
        error: 'No text response from Claude',
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    }

    const parsed = JSON.parse(textBlock.text) as ClaudeExtraction;
    return {
      raw: textBlock.text,
      parsed,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return { raw: '', parsed: null, error: 'Rate limit', inputTokens: 0, outputTokens: 0 };
    }
    if (err instanceof Anthropic.APIError) {
      return { raw: '', parsed: null, error: `API error: ${err.message}`, inputTokens: 0, outputTokens: 0 };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { raw: '', parsed: null, error: msg, inputTokens: 0, outputTokens: 0 };
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
  claude_card_name: string;
  claude_pokemon_name: string;
  claude_set_code: string;
  claude_set_number: string;
  claude_set_total: string;
  claude_language: string;
  claude_rarity: string;
  claude_confidence: string;
  claude_notes: string;
  set_match: string;       // YES/NO/CASE-INSENSITIVE-YES
  localId_match: string;
  combined_match: string;
  error: string;
}

const CSV_HEADERS: (keyof BenchRow)[] = [
  'filename', 'gt_set', 'gt_localId', 'gt_rarity',
  'claude_card_name', 'claude_pokemon_name', 'claude_set_code', 'claude_set_number',
  'claude_set_total', 'claude_language', 'claude_rarity', 'claude_confidence', 'claude_notes',
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
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set in .env.local');
    console.error('Get your key at https://console.anthropic.com/');
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

  console.log(`Found ${files.length} images. Model: Claude Haiku 4.5`);
  console.log(`Rate limit: ${RATE_LIMIT_MS}ms between requests (Tier 1 = 50 RPM)\n`);

  const rows: BenchRow[] = [];
  let total = 0;
  let setMatchCount = 0;
  let localIdMatchCount = 0;
  let combinedMatchCount = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

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
      const { parsed, error, inputTokens, outputTokens } = await callClaude(base64);

      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;

      if (!parsed) {
        console.log(`ERROR: ${error ?? 'parse failed'}`);
        rows.push({
          filename, gt_set: gt.set, gt_localId: gt.localId, gt_rarity: gt.rarity,
          claude_card_name: '', claude_pokemon_name: '', claude_set_code: '',
          claude_set_number: '', claude_set_total: '', claude_language: '',
          claude_rarity: '', claude_confidence: '', claude_notes: '',
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
          claude_card_name: parsed.card_name ?? '',
          claude_pokemon_name: parsed.pokemon_name ?? '',
          claude_set_code: detSet,
          claude_set_number: parsed.set_number?.toString() ?? '',
          claude_set_total: parsed.set_total?.toString() ?? '',
          claude_language: parsed.language ?? '',
          claude_rarity: parsed.rarity ?? '',
          claude_confidence: parsed.confidence ?? '',
          claude_notes: parsed.notes ?? '',
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
        claude_card_name: '', claude_pokemon_name: '', claude_set_code: '',
        claude_set_number: '', claude_set_total: '', claude_language: '',
        claude_rarity: '', claude_confidence: '', claude_notes: '',
        set_match: 'ERROR', localId_match: 'ERROR', combined_match: 'ERROR',
        error: msg.slice(0, 120),
      });
    }

    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }

  // Write CSV
  const outDir = path.resolve(__dirname, '../results');
  fs.mkdirSync(outDir, { recursive: true });
  const csvPath = path.join(outDir, 'test-bench-claude.csv');
  const csvLines = [
    CSV_HEADERS.join(','),
    ...rows.map((row) => CSV_HEADERS.map((h) => escapeCSV(row[h])).join(',')),
  ];
  fs.writeFileSync(csvPath, csvLines.join('\n') + '\n', 'utf-8');

  // Calculate cost: Haiku 4.5 pricing = $1/MTok input, $5/MTok output
  const inputCost = (totalInputTokens / 1_000_000) * 1.0;
  const outputCost = (totalOutputTokens / 1_000_000) * 5.0;
  const totalCost = inputCost + outputCost;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`Claude Haiku 4.5 results on ${total} cards:`);
  console.log(`  Set code match:   ${setMatchCount}/${total} (${((setMatchCount / total) * 100).toFixed(1)}%)`);
  console.log(`  Local ID match:   ${localIdMatchCount}/${total} (${((localIdMatchCount / total) * 100).toFixed(1)}%)`);
  console.log(`  Combined match:   ${combinedMatchCount}/${total} (${((combinedMatchCount / total) * 100).toFixed(1)}%)`);
  console.log(`\nToken usage:`);
  console.log(`  Input:  ${totalInputTokens.toLocaleString()} tokens`);
  console.log(`  Output: ${totalOutputTokens.toLocaleString()} tokens`);
  console.log(`  Estimated cost: $${totalCost.toFixed(4)} (Haiku 4.5: $1/MTok in, $5/MTok out)`);
  console.log(`\nCSV: ${csvPath}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`\nFor reference:`);
  console.log(`  Vision+catalog baseline = 19/30 (63%)`);
  console.log(`  Gemini 2.0 Flash = 21/21 (100% on processed)`);
  console.log(`  Claude Haiku 4.5 combined match ${combinedMatchCount}/30 → ` +
    (combinedMatchCount >= 27 ? 'EXCELLENT (≥90%)' :
     combinedMatchCount >= 24 ? 'GOOD (≥80%)' :
     combinedMatchCount >= 20 ? 'OK but not a huge win' :
     'Worse than current — Claude may not be the right model'));
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
