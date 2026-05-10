/**
 * One-shot calibration: measure the real input-token cost of our Gemini OCR
 * setup so we can set PROMPT_TOKEN_ESTIMATE accurately.
 *
 * Two measurements:
 * 1. `countTokens` on the prompt text alone → text-only cost.
 * 2. `generateContent` with a tiny 1x1 JPEG → tokens_in observed minus the
 *    minimum image tile (≈ 258 tokens for ≤384px) gives prompt + schema cost.
 *
 * Run: `bun run scripts/measure-gemini-prompt-tokens.ts`
 */

// Load .env.local manually — `server-only` in lib/api/gemini-vision.ts blocks
// direct import from a Node script, so we read the prompt source via regex
// and never touch the runtime module.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}

const SRC = readFileSync(resolve(process.cwd(), 'lib/api/gemini-vision.ts'), 'utf-8');
const promptMatch = SRC.match(/export const BASE_PROMPT = `([\s\S]*?)`;/);
if (!promptMatch) throw new Error('Could not extract BASE_PROMPT from source');
const BASE_PROMPT = promptMatch[1];

// Mirror the prod SCHEMA shape — only structure matters for token counting.
const SCHEMA = {
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
  required: ['card_name', 'language', 'confidence'],
};

const MODEL = 'gemini-3.1-flash-lite-preview';
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) throw new Error('GEMINI_API_KEY missing');

// Minimal JPEG: 1x1 white pixel. Smallest legal JPEG payload — Gemini bills
// it as a single ≤384px tile (258 tokens flat).
const ONE_PX_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AVN//2Q==';

async function countTokens(parts: unknown[]): Promise<number> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:countTokens?key=${KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }] }),
  });
  if (!res.ok) throw new Error(`countTokens ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { totalTokens: number };
  return data.totalTokens;
}

async function generateWithTinyImage(): Promise<{ tokens_in: number; tokens_out: number }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: BASE_PROMPT },
            { inline_data: { mime_type: 'image/jpeg', data: ONE_PX_JPEG_B64 } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: SCHEMA,
        maxOutputTokens: 50,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
  if (!res.ok) throw new Error(`generateContent ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  return {
    tokens_in: data.usageMetadata?.promptTokenCount ?? 0,
    tokens_out: data.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

const MIN_IMAGE_TOKENS = 258; // Gemini flat rate for ≤384x384 images.

async function main() {
  console.log(`Model: ${MODEL}`);
  console.log(`BASE_PROMPT length: ${BASE_PROMPT.length} chars`);
  console.log('');

  const promptOnly = await countTokens([{ text: BASE_PROMPT }]);
  console.log(`countTokens(prompt only)        = ${promptOnly} tokens`);

  const promptPlusTinyImg = await countTokens([
    { text: BASE_PROMPT },
    { inline_data: { mime_type: 'image/jpeg', data: ONE_PX_JPEG_B64 } },
  ]);
  console.log(`countTokens(prompt + 1px image) = ${promptPlusTinyImg} tokens`);

  const realCall = await generateWithTinyImage();
  console.log(
    `generateContent(prompt + 1px image + responseSchema) → tokens_in=${realCall.tokens_in}, tokens_out=${realCall.tokens_out}`,
  );
  console.log('');

  const schemaOverhead = realCall.tokens_in - promptPlusTinyImg;
  const promptBaseline = realCall.tokens_in - MIN_IMAGE_TOKENS;
  console.log(`→ Implied schema overhead (vs countTokens): ${schemaOverhead} tokens`);
  console.log(
    `→ Real prompt+schema baseline (tokens_in − 258 image): ${promptBaseline} tokens`,
  );
  console.log('');
  console.log(`Recommended: PROMPT_TOKEN_ESTIMATE = ${promptBaseline}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
