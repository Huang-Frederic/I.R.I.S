/**
 * Multi-model Gemini OCR bench. Tests the same 5 cards across 4 candidate
 * models with the EXACT prod config (prompt, schema, thinkingBudget=0).
 *
 * Output: a markdown table with accuracy, avg tokens, avg cost, avg latency.
 *
 * Run: npx tsx scripts/bench-multi-model.ts
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Load .env.local manually before importing anything that reads env vars.
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

// Single source of truth — modify in lib/api/gemini-vision.ts and this bench
// reflects the change automatically. Never copy-paste the prompt here.
import { buildPrompt, SCHEMA } from '../lib/api/gemini-vision';

const MODELS = [
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
] as const;

// Same paid-tier pricing as prod constants (USD per 1M tokens).
const PRICING: Record<string, { input: number; output: number }> = {
  'gemini-3-flash-preview':         { input: 0.50, output: 3.00 },
  'gemini-3.1-flash-lite-preview':  { input: 0.25, output: 1.50 },
  'gemini-2.5-flash':               { input: 0.30, output: 2.50 },
  'gemini-2.5-flash-lite':          { input: 0.10, output: 0.40 },
};
const USD_TO_EUR = 0.92;

interface CardResult {
  filename: string;
  expectedSet: string;
  expectedNum: string;
  setMatch: boolean;
  numMatch: boolean;
  tokensIn: number;
  tokensOut: number;
  costEur: number;
  latencyMs: number;
  error?: string;
}

interface ModelSummary {
  model: string;
  successCount: number;
  total: number;
  avgTokensIn: number;
  avgTokensOut: number;
  avgCostEur: number;
  avgLatencyMs: number;
  perCard: CardResult[];
}

function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return text;
  return text.slice(start, end + 1);
}

async function callModel(model: string, prompt: string, base64: string): Promise<{
  tokensIn: number; tokensOut: number; costEur: number;
  parsed: { set_code?: string; set_number?: string } | null;
  error?: string; latencyMs: number;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const start = Date.now();
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: base64 } }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: SCHEMA,
          maxOutputTokens: 300,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    return { tokensIn: 0, tokensOut: 0, costEur: 0, parsed: null,
      error: e instanceof Error ? e.message : 'fetch failed', latencyMs: Date.now() - start };
  }
  const latencyMs = Date.now() - start;

  if (!resp.ok) {
    const body = await resp.text();
    return { tokensIn: 0, tokensOut: 0, costEur: 0, parsed: null,
      error: `HTTP ${resp.status}: ${body.slice(0, 200)}`, latencyMs };
  }

  interface GResp {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  }
  const data = (await resp.json()) as GResp;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const finishReason = data.candidates?.[0]?.finishReason ?? '';
  const tokensIn = data.usageMetadata?.promptTokenCount ?? 0;
  const tokensOut = data.usageMetadata?.candidatesTokenCount ?? 0;
  const pricing = PRICING[model];
  const costUsd = (tokensIn * pricing.input + tokensOut * pricing.output) / 1_000_000;
  const costEur = costUsd * USD_TO_EUR;

  if (!text) {
    return { tokensIn, tokensOut, costEur, parsed: null, error: `no-content (${finishReason})`, latencyMs };
  }
  try {
    const parsed = JSON.parse(extractJsonObject(text)) as { set_code?: string; set_number?: string };
    return { tokensIn, tokensOut, costEur, parsed, latencyMs };
  } catch (e) {
    return { tokensIn, tokensOut, costEur, parsed: null,
      error: `parse fail: ${(e as Error).message.slice(0, 80)}`, latencyMs };
  }
}

function parseFilename(name: string): { set: string; num: string } {
  // e.g. "bw4_044_r.jpg" → set=bw4, num=044 → "44" after strip
  const stem = name.replace(/\.jpg$/, '');
  const [set, num] = stem.split('_');
  return { set, num: num.replace(/^0+/, '') || '0' };
}

async function main() {
  const dir = join(process.cwd(), 'cards_assets');
  const allFiles = readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort();
  const sample = allFiles.slice(0, 5);
  console.log(`Bench: ${MODELS.length} models × ${sample.length} cards = ${MODELS.length * sample.length} calls\n`);
  console.log(`Cards: ${sample.join(', ')}\n`);

  // Build the prod prompt once (includes the ~741-expansion constraint list).
  const prompt = await buildPrompt();

  const summaries: ModelSummary[] = [];

  for (const model of MODELS) {
    console.log(`\n=== ${model} ===`);
    const perCard: CardResult[] = [];
    for (const filename of sample) {
      const expected = parseFilename(filename);
      const buf = readFileSync(join(dir, filename));
      const base64 = buf.toString('base64');
      const result = await callModel(model, prompt, base64);
      const setMatch = result.parsed?.set_code?.toLowerCase() === expected.set.toLowerCase();
      const numMatch = result.parsed?.set_number === expected.num;
      perCard.push({
        filename,
        expectedSet: expected.set, expectedNum: expected.num,
        setMatch, numMatch,
        tokensIn: result.tokensIn, tokensOut: result.tokensOut,
        costEur: result.costEur, latencyMs: result.latencyMs,
        error: result.error,
      });
      const status = result.error
        ? `ERR ${result.error}`
        : setMatch && numMatch
          ? `OK   set=${result.parsed?.set_code} num=${result.parsed?.set_number}`
          : `MISS set=${result.parsed?.set_code} num=${result.parsed?.set_number} (expected ${expected.set}/${expected.num})`;
      console.log(`  ${filename.padEnd(24)} ${result.tokensIn.toString().padStart(5)}in /${result.tokensOut.toString().padStart(4)}out €${result.costEur.toFixed(6)} ${result.latencyMs}ms — ${status}`);
      // Rate limit: stay under 15 RPM = 4s between calls
      await new Promise((r) => setTimeout(r, 4500));
    }
    const success = perCard.filter((c) => c.setMatch && c.numMatch).length;
    summaries.push({
      model,
      successCount: success,
      total: perCard.length,
      avgTokensIn: perCard.reduce((s, c) => s + c.tokensIn, 0) / perCard.length,
      avgTokensOut: perCard.reduce((s, c) => s + c.tokensOut, 0) / perCard.length,
      avgCostEur: perCard.reduce((s, c) => s + c.costEur, 0) / perCard.length,
      avgLatencyMs: perCard.reduce((s, c) => s + c.latencyMs, 0) / perCard.length,
      perCard,
    });
  }

  console.log('\n\n=== SUMMARY ===\n');
  console.log('| Model | Acc | avg in | avg out | avg cost EUR | avg latency |');
  console.log('|---|---|---|---|---|---|');
  for (const s of summaries) {
    console.log(
      `| ${s.model} | ${s.successCount}/${s.total} | ${s.avgTokensIn.toFixed(0)} | ${s.avgTokensOut.toFixed(0)} | €${s.avgCostEur.toFixed(6)} | ${s.avgLatencyMs.toFixed(0)}ms |`,
    );
  }

  // Coût pour 100 scans
  console.log('\nCoût projeté pour 100 scans :');
  for (const s of summaries) {
    console.log(`  ${s.model.padEnd(35)} €${(s.avgCostEur * 100).toFixed(4)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
