/**
 * Test bench — measure OCR + enrichment accuracy on real card images.
 *
 * Usage:
 *   npx tsx scripts/test-bench.ts
 *
 * Reads every .jpg in cards_assets/, runs the full pipeline (resize → Vision
 * OCR → smart extraction → TCGdex enrichment), and compares against ground
 * truth parsed from the filename ({set}_{localId}_{rarity}[_{suffix}].jpg).
 *
 * Outputs results/test-bench.csv with per-image results.
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

const VISION_ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';
const TCGDEX_BASE = 'https://api.tcgdex.net/v2';
const MAX_DIM = 1600;

// ---------------------------------------------------------------------------
// Types (duplicated from lib/types to avoid server-only import chain)
// ---------------------------------------------------------------------------

interface WordAnnotation {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

interface OcrResult {
  text: string;
  confidence: number;
  words: WordAnnotation[];
  setNumberCandidate: { card: string; total: string; raw: string } | null;
  setCodeCandidate: string | null;
}

// ---------------------------------------------------------------------------
// Ground truth parser
// ---------------------------------------------------------------------------

interface GroundTruth {
  filename: string;
  set: string;
  localId: string;
  rarity: string;
}

function parseFilename(filename: string): GroundTruth | null {
  const base = filename.replace(/\.[^.]+$/, '');
  // Format: {set}_{localId}_{rarity}[_{suffix}]
  // Examples: sv11w_012_c_mb, s12a_111_rrr, xy_087
  const parts = base.split('_');
  if (parts.length < 2) return null;

  const set = parts[0];
  const localId = parts[1];
  const rarity = parts[2] ?? '';

  return { filename, set, localId, rarity };
}

// ---------------------------------------------------------------------------
// Image resize (mirrors browser resizeImage with maxDim=1600)
// ---------------------------------------------------------------------------

async function resizeToBase64(filepath: string): Promise<string> {
  const buf = await sharp(filepath)
    .resize(MAX_DIM, MAX_DIM, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return buf.toString('base64');
}

// ---------------------------------------------------------------------------
// Vision API (mirrors lib/api/vision.ts detectText, without server-only)
// ---------------------------------------------------------------------------

async function callVision(base64Image: string): Promise<OcrResult> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_VISION_API_KEY not set in .env.local');

  const response = await fetch(`${VISION_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        {
          image: { content: base64Image },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
          imageContext: { languageHints: ['ja', 'en'] },
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Vision API ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const first = data.responses?.[0];
  if (first?.error?.message) throw new Error(`Vision: ${first.error.message}`);

  const annotation = first?.fullTextAnnotation;
  const text: string = annotation?.text ?? '';
  const page = annotation?.pages?.[0];
  const confidence = extractConfidence(page);
  const words = page ? extractWords(page) : [];

  const { findSetNumberCandidate, findSetCodeCandidate } = await import(
    '../lib/utils/extract-from-words'
  );
  const setNumberCandidate = findSetNumberCandidate(words);
  const setCodeCandidate = findSetCodeCandidate(words, setNumberCandidate?.raw ?? null);

  return { text, confidence, words, setNumberCandidate, setCodeCandidate };
}

interface VisionVertex { x?: number; y?: number }
interface VisionWord {
  symbols?: { text?: string }[];
  boundingBox?: { vertices?: VisionVertex[] };
  confidence?: number;
}
interface VisionBlock {
  paragraphs?: { words?: VisionWord[] }[];
  confidence?: number;
}
interface VisionPage {
  width?: number;
  height?: number;
  confidence?: number;
  blocks?: VisionBlock[];
}

function extractConfidence(page: VisionPage | undefined): number {
  if (!page) return 0;
  if (typeof page.confidence === 'number' && page.confidence > 0) return page.confidence;
  const blocks = (page.blocks ?? [])
    .map((b) => b.confidence)
    .filter((c): c is number => typeof c === 'number');
  if (blocks.length === 0) return 0;
  return blocks.reduce((s, c) => s + c, 0) / blocks.length;
}

function extractWords(page: VisionPage): WordAnnotation[] {
  const pageW = page.width ?? 0;
  const pageH = page.height ?? 0;
  if (pageW === 0 || pageH === 0) return [];
  const out: WordAnnotation[] = [];
  for (const block of page.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const word of para.words ?? []) {
        const text = (word.symbols ?? []).map((s) => s.text ?? '').join('').trim();
        if (!text) continue;
        const vertices = word.boundingBox?.vertices ?? [];
        if (vertices.length === 0) continue;
        const xs = vertices.map((v) => v.x ?? 0);
        const ys = vertices.map((v) => v.y ?? 0);
        out.push({
          text,
          x: Math.min(...xs) / pageW,
          y: Math.min(...ys) / pageH,
          width: (Math.max(...xs) - Math.min(...xs)) / pageW,
          height: (Math.max(...ys) - Math.min(...ys)) / pageH,
          confidence: word.confidence ?? 0,
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Catalog helpers (inlined from lib/api/tcg-catalog.ts to avoid server-only)
// ---------------------------------------------------------------------------

/** Database row shape — matches the tcg_catalog table 1:1. */
interface CatalogRow {
  id: string;
  cardmarket_id: string;
  set_code: string;
  set_number: string;
  set_total: number | null;
  language: string;
  card_name: string;
  pokemon_name: string | null;
  pokemon_number: number | null;
  set_name: string;
  rarity: string | null;
  image_url: string | null;
  scraped_at: string;
}

/**
 * Strip leading zeros from an OCR-extracted set number ("012" → "12").
 */
function normalizeSetNumber(setNumber: string): string {
  if (!/^\d+$/.test(setNumber)) return setNumber;
  return setNumber.replace(/^0+/, '') || '0';
}

/**
 * Map a catalog row into the EnrichHit shape for test bench comparison.
 */
function catalogRowToEnrichHit(row: CatalogRow): EnrichHit {
  const setNumber = row.set_total != null ? `${row.set_number}/${row.set_total}` : row.set_number;
  return {
    card_id_tcg: `${row.set_code}-${row.set_number}`,
    card_name: row.card_name,
    set_name: row.set_name,
    set_code: row.set_code,
    set_number: setNumber,
    rarity: row.rarity ?? 'OTHER',
  };
}

/**
 * Direct lookup by (set_code, set_number, language). The fast path.
 */
async function catalogLookupByCode(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  setCode: string,
  setNumber: string,
  language: string,
): Promise<CatalogRow | null> {
  const { data, error } = await supabase
    .from('tcg_catalog')
    .select('*')
    .eq('set_code', setCode)
    .eq('set_number', normalizeSetNumber(setNumber))
    .eq('language', language)
    .maybeSingle();
  if (error) throw new Error(`tcg_catalog lookupByCode: ${error.message}`);
  return (data as CatalogRow | null) ?? null;
}

/**
 * Fallback lookup when set_code OCR was unreliable: find every row matching
 * the printed denominator + localId in the requested language.
 */
async function catalogLookupByTotal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  setTotal: number,
  setNumber: string,
  language: string,
): Promise<CatalogRow[]> {
  const { data, error } = await supabase
    .from('tcg_catalog')
    .select('*')
    .eq('set_total', setTotal)
    .eq('set_number', normalizeSetNumber(setNumber))
    .eq('language', language);
  if (error) throw new Error(`tcg_catalog lookupByTotal: ${error.message}`);
  return (data as CatalogRow[] | null) ?? [];
}

/**
 * Narrow a candidate list using the OCR text (which contains the Pokémon name).
 */
function catalogDisambiguateByName(
  cards: CatalogRow[],
  ocrText: string,
): { best: CatalogRow | null; candidates: CatalogRow[] } {
  if (cards.length === 0) return { best: null, candidates: [] };

  const matches = cards.filter(
    (c) =>
      ocrText.includes(c.card_name) ||
      (c.pokemon_name !== null && ocrText.includes(c.pokemon_name)),
  );
  if (matches.length === 1) return { best: matches[0], candidates: [matches[0]] };
  if (matches.length > 1) return { best: matches[0], candidates: matches };
  return { best: cards[0], candidates: cards };
}

// ---------------------------------------------------------------------------
// Enrichment (calls TCGdex directly, mirrors enrich/route.ts logic)
// ---------------------------------------------------------------------------

interface EnrichHit {
  card_id_tcg: string;
  card_name: string;
  set_name: string;
  set_code: string;
  set_number: string;
  rarity: string;
}

async function tryEnrich(
  ocr: OcrResult,
  lang: string = 'ja',
): Promise<{ best: EnrichHit | null; candidateCount: number; usedStrategy: string }> {
  const setCode = ocr.setCodeCandidate;
  const localId = ocr.setNumberCandidate?.card ?? null;
  const total = ocr.setNumberCandidate?.total ? Number(ocr.setNumberCandidate.total) : null;
  // Test bench uses TCGdex's "ja" lang code; map to our card_language enum.
  const cardLang = lang === 'ja' ? 'JP' : (lang.toUpperCase() as 'JP' | 'EN' | 'FR' | 'DE' | 'IT' | 'ES' | 'PT');

  // Lazy-load Supabase (avoids server-only blast radius).
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not set');
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Pre-compute fuzzy set code (used by multiple strategies below)
  let fuzzySetCode: string | null = null;
  if (localId && ocr.text) {
    const sets = await listSets(lang);
    const { findKnownSetCodeInText } = await import('../lib/utils/extract-from-words');
    fuzzySetCode = findKnownSetCodeInText(ocr.text, sets.map((s) => s.id));
  }

  // Strategy 1: catalog lookup with fuzzy-matched set code (most reliable)
  if (fuzzySetCode && localId) {
    try {
      const row = await catalogLookupByCode(supabase, fuzzySetCode, localId, cardLang);
      if (row) {
        return {
          best: catalogRowToEnrichHit(row),
          candidateCount: 1,
          usedStrategy: `catalog:fuzzy:${fuzzySetCode}`,
        };
      }
    } catch (err) {
      console.warn('catalog:fuzzy failed, falling through:', err instanceof Error ? err.message : err);
    }
  }

  // Strategy 2: catalog lookup with heuristic set code
  if (setCode && localId) {
    try {
      const row = await catalogLookupByCode(supabase, setCode, localId, cardLang);
      if (row) {
        return {
          best: catalogRowToEnrichHit(row),
          candidateCount: 1,
          usedStrategy: 'catalog:direct',
        };
      }
    } catch (err) {
      console.warn('catalog:direct failed, falling through:', err instanceof Error ? err.message : err);
    }
  }

  // Strategy 3: catalog by total (prone to collisions, use as fallback only)
  if (total != null && localId) {
    try {
      const rows = await catalogLookupByTotal(supabase, total, localId, cardLang);
      if (rows.length > 0) {
        const result = rows.length > 1
          ? catalogDisambiguateByName(rows, ocr.text)
          : { best: rows[0], candidates: rows };
        if (result.best) {
          return {
            best: catalogRowToEnrichHit(result.best),
            candidateCount: rows.length,
            usedStrategy: rows.length > 1 ? 'catalog:total+name' : 'catalog:total',
          };
        }
      }
    } catch (err) {
      console.warn('catalog:total failed, falling through:', err instanceof Error ? err.message : err);
    }
  }

  // Strategy 4: TCGdex live fallback (fuzzy by OCR text → known set IDs)
  if (fuzzySetCode && localId) {
    const card = await tcgdexLookup(fuzzySetCode, localId, lang);
    if (card) return { best: card, candidateCount: 1, usedStrategy: `tcgdex:fuzzy:${fuzzySetCode}` };
  }

  // Strategy 5: TCGdex direct (heuristic set code)
  if (setCode && localId) {
    const card = await tcgdexLookup(setCode, localId, lang);
    if (card) return { best: card, candidateCount: 1, usedStrategy: 'tcgdex:direct' };
  }

  // Strategy 6: TCGdex by total
  if (total != null && localId) {
    const cards = await findByTotal(total, localId, lang);
    if (cards.length > 0) {
      const nameMatches = cards.filter((c) => ocr.text.includes(c.card_name));
      if (nameMatches.length === 1)
        return { best: nameMatches[0], candidateCount: cards.length, usedStrategy: 'tcgdex:total+name1' };
      if (nameMatches.length > 1)
        return { best: nameMatches[0], candidateCount: nameMatches.length, usedStrategy: 'tcgdex:total+nameN' };
      return { best: cards[0], candidateCount: cards.length, usedStrategy: 'tcgdex:total-noname' };
    }
  }

  return { best: null, candidateCount: 0, usedStrategy: 'none' };
}

async function tcgdexLookup(
  setCode: string,
  localId: string,
  lang: string,
): Promise<EnrichHit | null> {
  const url = `${TCGDEX_BASE}/${lang}/cards/${encodeURIComponent(setCode)}-${encodeURIComponent(localId)}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) return null;
  interface TCGCard {
    id: string;
    localId: string;
    name: string;
    rarity?: string;
    set?: { id?: string; name?: string; cardCount?: { official?: number; total?: number } };
  }
  const card = (await res.json()) as TCGCard;
  const total = card.set?.cardCount?.official ?? card.set?.cardCount?.total ?? '';
  return {
    card_id_tcg: card.id,
    card_name: card.name,
    set_name: card.set?.name ?? '',
    set_code: card.set?.id ?? '',
    set_number: total !== '' ? `${card.localId}/${total}` : card.localId,
    rarity: card.rarity ?? '',
  };
}

interface SetSummary {
  id: string;
  name: string;
  cardCount?: { total?: number; official?: number };
}

const setsCache = new Map<string, SetSummary[]>();

async function listSets(lang: string): Promise<SetSummary[]> {
  const cached = setsCache.get(lang);
  if (cached) return cached;
  const res = await fetch(`${TCGDEX_BASE}/${lang}/sets`);
  if (!res.ok) throw new Error(`sets ${res.status}`);
  const sets = (await res.json()) as SetSummary[];
  setsCache.set(lang, sets);
  return sets;
}

async function findByTotal(
  total: number,
  localId: string,
  lang: string,
): Promise<EnrichHit[]> {
  const sets = await listSets(lang);

  const lookupAll = async (candidates: SetSummary[]): Promise<EnrichHit[]> => {
    const results = await Promise.all(
      candidates.map((s) => tcgdexLookup(s.id, localId, lang).catch(() => null)),
    );
    return results.filter((c): c is EnrichHit => c !== null);
  };

  const strict = sets.filter(
    (s) => s.cardCount?.official === total || s.cardCount?.total === total,
  );
  const strictHits = strict.length > 0 ? await lookupAll(strict) : [];
  if (strictHits.length > 0) return strictHits;

  const localIdNum = Number(localId);
  const minCards = Number.isFinite(localIdNum) ? Math.max(localIdNum, total + 1) : total + 1;
  const loose = sets
    .filter((s) => (s.cardCount?.official ?? 0) >= minCards)
    .reverse();
  if (loose.length === 0) return [];
  return lookupAll(loose.slice(0, 20));
}

// ---------------------------------------------------------------------------
// CSV output
// ---------------------------------------------------------------------------

interface BenchRow {
  filename: string;
  gt_set: string;
  gt_localId: string;
  gt_rarity: string;
  ocr_confidence: string;
  detected_set_code: string;
  detected_set_number: string;
  used_strategy: string;
  enriched_card_id: string;
  enriched_set_code: string;
  enriched_card_name: string;
  enriched_rarity: string;
  candidate_count: string;
  set_match: string;
  localId_match: string;
  ocr_text_snippet: string;
}

const CSV_HEADERS: (keyof BenchRow)[] = [
  'filename',
  'gt_set',
  'gt_localId',
  'gt_rarity',
  'ocr_confidence',
  'detected_set_code',
  'detected_set_number',
  'used_strategy',
  'enriched_card_id',
  'enriched_set_code',
  'enriched_card_name',
  'enriched_rarity',
  'candidate_count',
  'set_match',
  'localId_match',
  'ocr_text_snippet',
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
  const dir = path.resolve(__dirname, '../cards_assets');
  if (!fs.existsSync(dir)) {
    console.error('cards_assets/ directory not found');
    process.exit(1);
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .sort();

  console.log(`Found ${files.length} images in cards_assets/\n`);

  const rows: BenchRow[] = [];
  let correct = 0;
  let extractedCorrectly = 0;
  let total = 0;

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const gt = parseFilename(filename);
    if (!gt) {
      console.log(`[${i + 1}/${files.length}] SKIP ${filename} — can't parse filename`);
      continue;
    }

    total++;
    const filepath = path.join(dir, filename);
    process.stdout.write(`[${i + 1}/${files.length}] ${filename} ... `);

    try {
      const base64 = await resizeToBase64(filepath);
      const ocr = await callVision(base64);
      const { best, candidateCount, usedStrategy } = await tryEnrich(ocr);

      const detectedSetCode = ocr.setCodeCandidate ?? '';
      const detectedSetNumber = ocr.setNumberCandidate?.raw ?? '';

      const enrichedSetCode = best?.set_code ?? '';
      const setMatch =
        enrichedSetCode.toLowerCase() === gt.set.toLowerCase() ? 'YES' : 'NO';
      const enrichedSetNumber = best?.set_number ?? '';
      const enrichedLocalId = enrichedSetNumber.split('/')[0] ?? '';
      // Normalize both sides for comparison (catalog stores "27", filename is "027")
      const localIdMatch = normalizeSetNumber(enrichedLocalId) === normalizeSetNumber(gt.localId) ? 'YES' : 'NO';

      if (setMatch === 'YES' && localIdMatch === 'YES') correct++;

      // Extraction-only success: did we get the right set_code (via fuzzy or
      // heuristic) and right localId from OCR, regardless of TCGdex catalog?
      const ocrLocalId = ocr.setNumberCandidate?.card ?? '';
      let ocrSetCode = '';
      const sets = await listSets('ja');
      const { findKnownSetCodeInText } = await import('../lib/utils/extract-from-words');
      const fuzzy = findKnownSetCodeInText(ocr.text, sets.map((s) => s.id));
      ocrSetCode = (fuzzy ?? detectedSetCode).toLowerCase();
      if (ocrSetCode === gt.set.toLowerCase() && ocrLocalId === gt.localId) {
        extractedCorrectly++;
      }

      const snippet = ocr.text.replace(/\n/g, ' ').slice(0, 80);

      const row: BenchRow = {
        filename,
        gt_set: gt.set,
        gt_localId: gt.localId,
        gt_rarity: gt.rarity,
        ocr_confidence: (ocr.confidence * 100).toFixed(1),
        detected_set_code: detectedSetCode,
        detected_set_number: detectedSetNumber,
        used_strategy: usedStrategy,
        enriched_card_id: best?.card_id_tcg ?? '',
        enriched_set_code: enrichedSetCode,
        enriched_card_name: best?.card_name ?? '',
        enriched_rarity: best?.rarity ?? '',
        candidate_count: String(candidateCount),
        set_match: setMatch,
        localId_match: localIdMatch,
        ocr_text_snippet: snippet,
      };
      rows.push(row);

      const status = setMatch === 'YES' && localIdMatch === 'YES' ? 'OK' : 'MISS';
      console.log(
        `${status} | set:${setMatch} id:${localIdMatch} | [${usedStrategy}] detected=${detectedSetCode} ${detectedSetNumber} → ${enrichedSetCode} ${best?.card_name ?? '?'}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`ERROR: ${msg}`);
      rows.push({
        filename,
        gt_set: gt.set,
        gt_localId: gt.localId,
        gt_rarity: gt.rarity,
        ocr_confidence: '',
        detected_set_code: '',
        detected_set_number: '',
        used_strategy: 'error',
        enriched_card_id: '',
        enriched_set_code: '',
        enriched_card_name: '',
        enriched_rarity: '',
        candidate_count: '',
        set_match: 'ERROR',
        localId_match: 'ERROR',
        ocr_text_snippet: msg.slice(0, 80),
      });
    }

    // Small delay to avoid Vision rate limiting
    await new Promise((r) => setTimeout(r, 500));
  }

  // Write CSV + per-image OCR dumps for debugging
  const outDir = path.resolve(__dirname, '../results');
  fs.mkdirSync(outDir, { recursive: true });
  const csvPath = path.join(outDir, 'test-bench.csv');

  const csvLines = [
    CSV_HEADERS.join(','),
    ...rows.map((row) => CSV_HEADERS.map((h) => escapeCSV(row[h])).join(',')),
  ];
  fs.writeFileSync(csvPath, csvLines.join('\n') + '\n', 'utf-8');

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Enriched correctly:  ${correct}/${total} (${((correct / total) * 100).toFixed(1)}%) — full TCGdex match`);
  console.log(`Extracted correctly: ${extractedCorrectly}/${total} (${((extractedCorrectly / total) * 100).toFixed(1)}%) — OCR got the right set+localId`);
  console.log(`CSV written to: ${csvPath}`);
  console.log(`${'='.repeat(60)}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
