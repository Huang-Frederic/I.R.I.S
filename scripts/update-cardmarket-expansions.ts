/**
 * update-cardmarket-expansions — one command to teach IRIS a freshly
 * released set ("Pitch Black" problem).
 *
 * Why this exists: cardmarket_expansions.json (committed, id → FR name) is
 * the source of truth for the daily dump upload, and upload-cardmarket-dumps
 * DROPS every product whose expansion isn't in it. A new set therefore has
 * no expansion row, no products, no pricing — and since set_prefix only
 * comes from the gallery scraper, the scan can't resolve the set either.
 *
 * What one run does:
 *   1. Fetch the FR + EN + JA expansion dropdowns from Cardmarket
 *      (BrightData Web Unlocker — same plumbing as scrape-cm-expansion-names).
 *   2. Diff against the committed cardmarket_expansions.json → new sets.
 *   3. Rewrite the JSON with the new ids (commit it so the nightly GitHub
 *      Action stops dropping their products).
 *   4. Upsert ALL expansions into cardmarket_expansions (name + name_en +
 *      name_ja; set_prefix untouched) — replaces a scrape-cm-expansion-names
 *      run.
 *   5. Download the S3 dumps and upsert products + pricing for the NEW
 *      expansions only (instant pricing, no wait for the nightly action).
 *   6. Build the gallery-scraper input for the new sets and, unless
 *      --no-scrape, run scrapers/cardmarket (fills cardmarket_card_index +
 *      set_prefix → the scan resolves the set, Strategy 0/1 work).
 *   7. Verify: set_prefix present? index rows? Print what's left to do.
 *
 * Usage:
 *   npm run update-expansions                     # full flow
 *   npm run update-expansions -- --dry-run        # report only, write nothing
 *   npm run update-expansions -- --no-scrape      # skip the gallery scrape
 *   npm run update-expansions -- --rescrape-missing=6500
 *       # also scrape already-known expansions whose set_prefix is still
 *       # NULL (id >= 6500) — e.g. to retry after a failed scrape
 *
 * Required env (.env.local): NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, BRIGHTDATA_TOKEN (+ BRIGHTDATA_ZONE, default
 * "iris").
 */

import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(__dirname, '..', '.env.local') });
dotenvConfig();

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(__dirname, '..');
const EXPANSIONS_JSON = path.join(ROOT, 'cardmarket_expansions.json');
const SCRAPER_DIR = path.join(ROOT, 'scrapers', 'cardmarket');
const SCRAPER_INPUT = path.join(SCRAPER_DIR, 'storage', 'key_value_stores', 'default', 'INPUT.json');

const BRIGHTDATA_ENDPOINT = 'https://api.brightdata.com/request';
const S3_BASE = 'https://downloads.s3.cardmarket.com/productCatalog';
const URL_SINGLES = `${S3_BASE}/productList/products_singles_6.json`;
const URL_PRICING = `${S3_BASE}/priceGuide/price_guide_6.json`;
const CM_DROPDOWN_URL = (locale: string) =>
  `https://www.cardmarket.com/${locale}/Pokemon/Products/Singles?searchMode=v2&idCategory=51`;

const CHUNK = 500;

/* ----------------------------- pure helpers ----------------------------- */

export interface DropdownExpansion {
  idExpansion: number;
  name: string;
}

/** Parse the expansion <select> options off a CM Pokemon Singles page. */
export function parseExpansionDropdown(html: string): DropdownExpansion[] {
  const dom = new JSDOM(html);
  const options = dom.window.document.querySelectorAll<HTMLOptionElement>(
    'select[name="idExpansion"] option',
  );
  const out: DropdownExpansion[] = [];
  for (const opt of Array.from(options)) {
    const value = opt.getAttribute('value');
    const name = opt.textContent?.trim() ?? '';
    if (!value || value === '0' || !name) continue;
    const id = Number(value);
    if (!Number.isFinite(id) || id <= 0) continue;
    out.push({ idExpansion: id, name });
  }
  return out;
}

/** Ids present in the dropdown but missing from the committed JSON map. */
export function diffNewExpansions(
  dropdown: DropdownExpansion[],
  committed: Record<string, string>,
): DropdownExpansion[] {
  const known = new Set(Object.keys(committed).map(Number));
  return dropdown.filter((e) => !known.has(e.idExpansion)).sort((a, b) => a.idExpansion - b.idExpansion);
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cardmarket URL slug — EN name, diacritics/apostrophes stripped (same rules as generate-rescrape-input). */
export function slugify(nameEn: string): string {
  return nameEn
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^A-Za-z0-9-\s]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * FR-localised duplicates and sealed-product wrappers: added to the JSON/DB
 * (so their products aren't dropped) but skipped by the gallery scraper —
 * same heuristic as generate-rescrape-input.ts.
 */
export function isFrLocalisation(nameFr: string, nameEn: string | null): boolean {
  if (!nameEn) return false;
  if (nameFr.toLowerCase() === nameEn.toLowerCase()) return false;
  if (/^produits\s/i.test(nameFr)) return true;
  if (/kit\s+(du\s+)?dresseur/i.test(nameFr)) return true;
  if (/^académie de combat/i.test(nameFr)) return true;
  if (/^mon premier combat$/i.test(nameFr)) return true;
  if (/pokémon\s+packs?\s+récompense/i.test(nameFr)) return true;
  return false;
}

export interface ScraperInputEntry {
  idExpansion: number;
  name: string;
  slug: string;
}

export function buildScraperInput(entries: ScraperInputEntry[]) {
  return {
    expansions: entries,
    skipExisting: true,
    concurrency: 3,
    // 30 is the cardmarket default — higher values silently fail on some sets.
    perPage: 30,
  };
}

/* ----------------------------- impure parts ----------------------------- */

interface CatalogShape {
  products: Array<{ idProduct: number; name: string; idExpansion: number; idMetacard: number }>;
}
interface PricingShape {
  priceGuides: Array<Record<string, number | null>>;
}

async function fetchViaBrightData(url: string): Promise<string> {
  const token = process.env.BRIGHTDATA_TOKEN;
  const zone = process.env.BRIGHTDATA_ZONE ?? 'iris';
  const res = await fetch(BRIGHTDATA_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ zone, url, format: 'raw' }),
  });
  if (!res.ok) throw new Error(`BrightData ${res.status}: ${await res.text()}`);
  return res.text();
}

async function fetchJson<T>(url: string, label: string): Promise<T> {
  console.log(`  fetching ${label}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${res.statusText}`);
  const text = await res.text();
  console.log(`  ${label}: ${(text.length / 1024 / 1024).toFixed(1)} MB`);
  return JSON.parse(text) as T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function uploadInChunks(supabase: any, table: string, rows: unknown[], conflictKey: string): Promise<void> {
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from(table).upsert(slice, { onConflict: conflictKey });
    if (error) throw new Error(`${table} upsert at offset ${i}: ${error.message}`);
    written += slice.length;
    process.stdout.write(`\r  ${table}: ${written}/${rows.length}`);
  }
  if (rows.length > 0) process.stdout.write('\n');
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const noScrape = process.argv.includes('--no-scrape');
  const rescrapeArg = process.argv.find((a) => a.startsWith('--rescrape-missing'));
  const rescrapeMinId = rescrapeArg ? Number(rescrapeArg.split('=')[1] ?? '0') : null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY must be set (.env.local)');
  }
  if (!process.env.BRIGHTDATA_TOKEN) {
    throw new Error(
      'BRIGHTDATA_TOKEN must be set — the Cardmarket dropdowns sit behind Cloudflare.\n' +
      'Same token as the gallery scraper (see scrapers/cardmarket/README.md).',
    );
  }
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /* 1. Dropdowns (FR authoritative for names, EN/JA for the extra columns) */
  console.log('[1/6] Fetching Cardmarket expansion dropdowns (FR/EN/JA)...');
  const [frHtml, enHtml, jaHtml] = await Promise.all([
    fetchViaBrightData(CM_DROPDOWN_URL('fr')),
    fetchViaBrightData(CM_DROPDOWN_URL('en')),
    fetchViaBrightData(CM_DROPDOWN_URL('ja')),
  ]);
  const frList = parseExpansionDropdown(frHtml);
  const enById = new Map(parseExpansionDropdown(enHtml).map((e) => [e.idExpansion, e.name]));
  const jaById = new Map(parseExpansionDropdown(jaHtml).map((e) => [e.idExpansion, e.name]));
  if (frList.length === 0) throw new Error('FR dropdown parsed to 0 expansions — page layout changed?');
  console.log(`  FR: ${frList.length} — EN: ${enById.size} — JA: ${jaById.size}`);

  /* 2. Diff vs committed JSON */
  const committed = JSON.parse(readFileSync(EXPANSIONS_JSON, 'utf-8')) as Record<string, string>;
  const newExpansions = diffNewExpansions(frList, committed);
  console.log(`\n[2/6] ${newExpansions.length} new expansion(s) vs cardmarket_expansions.json:`);
  for (const e of newExpansions) {
    console.log(`  + ${e.idExpansion}  ${e.name}${enById.has(e.idExpansion) ? `  (EN: ${enById.get(e.idExpansion)})` : ''}`);
  }
  if (newExpansions.length === 0) console.log('  (nothing new — names/prices still refreshed below)');

  if (dryRun) {
    console.log('\n--dry-run: stopping before any write.');
    return;
  }

  /* 3. Rewrite the committed JSON */
  if (newExpansions.length > 0) {
    const merged: Record<string, string> = { ...committed };
    for (const e of newExpansions) merged[String(e.idExpansion)] = e.name;
    // Integer-like keys serialize in ascending numeric order — matches the
    // committed file, so the diff is only the added lines.
    writeFileSync(EXPANSIONS_JSON, JSON.stringify(merged, null, 2) + '\n');
    console.log(`\n[3/6] cardmarket_expansions.json updated (${Object.keys(merged).length} entries) — COMMIT THIS FILE.`);
  } else {
    console.log('\n[3/6] cardmarket_expansions.json unchanged.');
  }

  /* 4. Upsert every expansion row (FR name + EN/JA names; set_prefix untouched) */
  console.log('\n[4/6] Upserting cardmarket_expansions (names FR/EN/JA)...');
  const expansionRows = frList.map((e) => ({
    id_expansion: e.idExpansion,
    name: e.name,
    name_normalized: normalize(e.name),
    name_en: enById.get(e.idExpansion) ?? null,
    name_ja: jaById.get(e.idExpansion) ?? null,
  }));
  await uploadInChunks(supabase, 'cardmarket_expansions', expansionRows, 'id_expansion');

  /* 5. Products + pricing for the new expansions only */
  if (newExpansions.length > 0) {
    console.log('\n[5/6] Loading S3 dumps for the new expansions...');
    const catalog = await fetchJson<CatalogShape>(URL_SINGLES, 'singles catalog');
    const pricing = await fetchJson<PricingShape>(URL_PRICING, 'pricing');
    const newIds = new Set(newExpansions.map((e) => e.idExpansion));
    const productRows = catalog.products
      .filter((p) => newIds.has(p.idExpansion))
      .map((p) => {
        const i = p.name.indexOf(' [');
        const prefix = i === -1 ? p.name : p.name.slice(0, i);
        return {
          id_product: p.idProduct,
          name: p.name,
          card_prefix: prefix,
          card_prefix_normalized: normalize(prefix),
          id_expansion: p.idExpansion,
          id_metacard: p.idMetacard || null,
        };
      });
    const productIds = new Set(productRows.map((p) => p.id_product));
    const pricingRows = pricing.priceGuides
      .filter((p) => productIds.has(Number(p.idProduct)))
      .map((p) => ({
        id_product: Number(p.idProduct),
        low: p.low ?? null,
        trend: p.trend ?? null,
        avg: p.avg ?? null,
        avg1: p.avg1 ?? null,
        avg7: p.avg7 ?? null,
        avg30: p.avg30 ?? null,
        low_holo: p['low-holo'] ?? null,
        trend_holo: p['trend-holo'] ?? null,
        avg_holo: p['avg-holo'] ?? null,
        updated_at: new Date().toISOString(),
      }));
    console.log(`  ${productRows.length} products, ${pricingRows.length} pricing rows for the new sets`);
    await uploadInChunks(supabase, 'cardmarket_products', productRows, 'id_product');
    await uploadInChunks(supabase, 'cardmarket_pricing', pricingRows, 'id_product');
  } else {
    console.log('\n[5/6] No new expansion — dumps skipped (the nightly action keeps them fresh).');
  }

  /* 6. Gallery scrape → cardmarket_card_index + set_prefix */
  let scrapeTargets: ScraperInputEntry[] = newExpansions
    .filter((e) => !isFrLocalisation(e.name, enById.get(e.idExpansion) ?? null))
    .map((e) => ({
      idExpansion: e.idExpansion,
      name: enById.get(e.idExpansion) ?? e.name,
      slug: slugify(enById.get(e.idExpansion) ?? e.name),
    }));

  if (rescrapeMinId !== null) {
    const { data: nullPrefix } = await supabase
      .from('cardmarket_expansions')
      .select('id_expansion, name, name_en')
      .is('set_prefix', null)
      .gte('id_expansion', rescrapeMinId)
      .order('id_expansion');
    const already = new Set(scrapeTargets.map((t) => t.idExpansion));
    for (const r of (nullPrefix ?? []) as Array<{ id_expansion: number; name: string; name_en: string | null }>) {
      if (already.has(r.id_expansion)) continue;
      if (isFrLocalisation(r.name, r.name_en)) continue;
      scrapeTargets.push({
        idExpansion: r.id_expansion,
        name: r.name_en ?? r.name,
        slug: slugify(r.name_en ?? r.name),
      });
    }
    scrapeTargets = scrapeTargets.sort((a, b) => a.idExpansion - b.idExpansion);
  }

  if (scrapeTargets.length === 0) {
    console.log('\n[6/6] Nothing to scrape — every expansion already has its set_prefix/index.');
    console.log('\nDone.');
    return;
  }

  mkdirSync(path.dirname(SCRAPER_INPUT), { recursive: true });
  writeFileSync(SCRAPER_INPUT, JSON.stringify(buildScraperInput(scrapeTargets), null, 2));
  console.log(`\n[6/6] Scraper input written: ${SCRAPER_INPUT}`);
  for (const t of scrapeTargets) console.log(`  → ${t.idExpansion}  ${t.name}  (slug: ${t.slug})`);

  const scraperReady = existsSync(path.join(SCRAPER_DIR, 'node_modules'));
  if (noScrape) {
    console.log('\n--no-scrape: run it yourself with  cd scrapers/cardmarket && npx tsx src/main.ts');
  } else if (!scraperReady) {
    console.log('\nScraper deps missing — run:  cd scrapers/cardmarket && npm ci && npx tsx src/main.ts');
  } else {
    console.log('\nRunning the gallery scraper (BrightData)...\n');
    const res = spawnSync('npx', ['tsx', 'src/main.ts'], {
      cwd: SCRAPER_DIR,
      stdio: 'inherit',
      env: {
        ...process.env,
        // The scraper reads SUPABASE_URL (not NEXT_PUBLIC_) — bridge it.
        SUPABASE_URL: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
      },
    });
    if (res.status !== 0) {
      console.error(`\nScraper exited with code ${res.status} — retry later with:`);
      console.error('  npm run update-expansions -- --rescrape-missing=6000');
    }
  }

  /* Post-verification on the new sets */
  const verifyIds = scrapeTargets.map((t) => t.idExpansion);
  const { data: verifyRows } = await supabase
    .from('cardmarket_expansions')
    .select('id_expansion, name, set_prefix')
    .in('id_expansion', verifyIds);
  console.log('\nVerification:');
  for (const row of (verifyRows ?? []) as Array<{ id_expansion: number; name: string; set_prefix: string | null }>) {
    const { count } = await supabase
      .from('cardmarket_card_index')
      .select('id_product', { count: 'exact', head: true })
      .eq('id_expansion', row.id_expansion);
    const ok = row.set_prefix !== null && (count ?? 0) > 0;
    console.log(`  ${ok ? '✓' : '✗'} ${row.id_expansion}  ${row.name} — set_prefix=${row.set_prefix ?? 'NULL'}, index=${count ?? 0} cards`);
  }

  console.log('\nNext steps:');
  console.log('  - git add cardmarket_expansions.json && commit (else the nightly action keeps dropping the new products)');
  console.log('  - npm run snapshot-cardmarket-index   (protect the scrape)');
  console.log('  - npm run reenrich-cards              (only if cards of the new set were scanned before this run)');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
