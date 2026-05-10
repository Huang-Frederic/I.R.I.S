/**
 * Multi-language Gemini OCR diagnostic bench.
 *
 * Runs the prod prompt + config (gemini-3.1-flash-lite-preview, thinkingBudget=0)
 * on all images in cards_assets/, then for each result attempts a tcg_catalog
 * lookup with the extracted (set_code, set_number, language). Success = catalog
 * hit. Groups results by Gemini's detected language to identify per-language
 * failure rates without needing pre-annotated ground truth.
 *
 * Run: npx tsx scripts/bench-multilang.ts
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Load .env.local
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

const MODEL = 'gemini-3.1-flash-lite-preview';
const PRICING = { input: 0.25, output: 1.50 };
const USD_TO_EUR = 0.92;

// Single source of truth — modify in lib/api/gemini-vision.ts and this bench
// reflects the change automatically. Never copy-paste the prompt here.
import { buildPrompt, SCHEMA } from '../lib/api/gemini-vision';

interface GeminiCall {
  ok: boolean;
  card_name?: string | null;
  set_code?: string | null;
  set_number?: string | null;
  set_total?: number | null;
  language?: string | null;
  confidence?: string | null;
  tokensIn: number;
  tokensOut: number;
  costEur: number;
  latencyMs: number;
  error?: string;
}

interface CatalogMatch {
  hit: boolean;
  matchedRow?: { set_code: string; set_number: string; language: string; card_name: string };
  query?: string;
}

function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return text;
  return text.slice(start, end + 1);
}

function normalizeSetNumber(s: string): string {
  if (!/^\d+$/.test(s)) return s;
  return s.replace(/^0+/, '') || '0';
}

function normalizeSetCode(c: string): string {
  return c.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

async function callGemini(prompt: string, base64: string): Promise<GeminiCall> {
  const apiKey = process.env.GEMINI_API_KEY!;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
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
    return { ok: false, tokensIn: 0, tokensOut: 0, costEur: 0, latencyMs: Date.now() - start, error: e instanceof Error ? e.message : 'fetch fail' };
  }
  const latencyMs = Date.now() - start;

  if (!resp.ok) {
    const body = await resp.text();
    return { ok: false, tokensIn: 0, tokensOut: 0, costEur: 0, latencyMs, error: `HTTP ${resp.status}: ${body.slice(0, 100)}` };
  }
  interface R { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }
  const data = (await resp.json()) as R;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const tokensIn = data.usageMetadata?.promptTokenCount ?? 0;
  const tokensOut = data.usageMetadata?.candidatesTokenCount ?? 0;
  const costEur = ((tokensIn * PRICING.input + tokensOut * PRICING.output) / 1_000_000) * USD_TO_EUR;

  if (!text) {
    return { ok: false, tokensIn, tokensOut, costEur, latencyMs, error: 'empty content' };
  }
  try {
    const p = JSON.parse(extractJsonObject(text));
    return {
      ok: true,
      card_name: p.card_name ?? null,
      set_code: p.set_code ?? null,
      set_number: p.set_number ?? null,
      set_total: p.set_total ?? null,
      language: p.language ?? null,
      confidence: p.confidence ?? null,
      tokensIn, tokensOut, costEur, latencyMs,
    };
  } catch (e) {
    return { ok: false, tokensIn, tokensOut, costEur, latencyMs, error: `parse: ${(e as Error).message.slice(0, 50)}` };
  }
}

async function catalogLookup(
  supabase: SupabaseClient,
  setCode: string,
  setNumber: string,
  language: string,
): Promise<CatalogMatch> {
  const normNum = normalizeSetNumber(setNumber);

  // Fast path: strict equality
  const { data: strict } = await supabase
    .from('tcg_catalog')
    .select('set_code, set_number, language, card_name')
    .eq('set_code', setCode)
    .eq('set_number', normNum)
    .eq('language', language)
    .maybeSingle();
  if (strict) return { hit: true, matchedRow: strict as CatalogMatch['matchedRow'], query: 'strict' };

  // Slow path: case-insensitive on set_code
  const { data: candidates } = await supabase
    .from('tcg_catalog')
    .select('set_code, set_number, language, card_name')
    .eq('set_number', normNum)
    .eq('language', language);
  const normCode = normalizeSetCode(setCode);
  const rows = (candidates ?? []) as Array<{ set_code: string; set_number: string; language: string; card_name: string }>;
  const found = rows.find((r) => normalizeSetCode(r.set_code) === normCode);
  if (found) return { hit: true, matchedRow: found, query: 'normalized' };

  return { hit: false };
}

async function main() {
  if (!process.env.GEMINI_API_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing env vars');
    process.exit(1);
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const dir = join(process.cwd(), 'cards_assets');
  const files = readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort();
  console.log(`Bench multilang: ${files.length} cards × ${MODEL}\n`);

  // Build the prod prompt once (includes the ~741-expansion constraint list).
  const prompt = await buildPrompt();

  interface Result {
    filename: string;
    gemini: GeminiCall;
    match: CatalogMatch | null;
  }
  const results: Result[] = [];

  for (const filename of files) {
    const buf = readFileSync(join(dir, filename));
    const base64 = buf.toString('base64');
    const gemini = await callGemini(prompt, base64);
    let match: CatalogMatch | null = null;
    if (gemini.ok && gemini.set_code && gemini.set_number && gemini.language) {
      try {
        match = await catalogLookup(supabase, gemini.set_code, gemini.set_number, gemini.language);
      } catch (e) {
        match = { hit: false, query: `error: ${(e as Error).message}` };
      }
    }
    results.push({ filename, gemini, match });
    const status = !gemini.ok
      ? `FAIL ${gemini.error}`
      : match?.hit
        ? `✓ catalog hit (${match.query}) → ${match.matchedRow?.card_name?.slice(0, 30)}`
        : `✗ no catalog hit | gemini said: ${gemini.set_code}/${gemini.set_number} ${gemini.language}`;
    console.log(`  ${filename.padEnd(28)} | ${(gemini.language ?? '??').padEnd(3)} | ${status}`);
    await new Promise((r) => setTimeout(r, 4500));
  }

  // Group by Gemini-detected language
  console.log('\n\n=== PER-LANGUAGE SUMMARY ===\n');
  const byLang = new Map<string, Result[]>();
  for (const r of results) {
    const lang = r.gemini.language ?? 'UNKNOWN';
    if (!byLang.has(lang)) byLang.set(lang, []);
    byLang.get(lang)!.push(r);
  }

  console.log('| Language | n | catalog hit | hit rate |');
  console.log('|---|---|---|---|');
  for (const [lang, rows] of [...byLang.entries()].sort()) {
    const hits = rows.filter((r) => r.match?.hit).length;
    const rate = ((hits / rows.length) * 100).toFixed(0);
    console.log(`| ${lang} | ${rows.length} | ${hits} | ${rate}% |`);
  }

  console.log('\n=== FAILED CATALOG LOOKUPS (for visual inspection) ===');
  for (const r of results.filter((x) => x.gemini.ok && !x.match?.hit)) {
    console.log(`  ${r.filename}: gemini=${r.gemini.set_code}/${r.gemini.set_number} (${r.gemini.language}) name="${r.gemini.card_name}"`);
  }

  // Cost summary
  const totalCost = results.reduce((s, r) => s + r.gemini.costEur, 0);
  const avgCost = totalCost / results.length;
  console.log(`\nTotal cost: €${totalCost.toFixed(4)} (avg €${avgCost.toFixed(6)}/card)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
