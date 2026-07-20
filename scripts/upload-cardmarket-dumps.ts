// Bulk-uploads the Cardmarket data files to Supabase. By default the script
// fetches the dumps directly from Cardmarket's public S3 bucket — no auth,
// no Cloudflare challenge, ~30 MB total. Use `--local` to read from disk
// instead (e.g. when iterating offline).
//
//   - cardmarket_expansions.json (committed in repo, ~22 KB, manual refresh)
//                               → cardmarket_expansions  (~741 rows)
//   - products_singles_6.json   → cardmarket_products    (~67k rows)
//   - price_guide_6.json        → cardmarket_pricing     (~72k rows)
//
// products_nonsingles_6.json (boosters / displays) is intentionally skipped:
// the singles cron only needs single-card pricing.
//
// Usage:
//   npm run upload-cardmarket-dumps          # fetch from S3 (default)
//   npm run upload-cardmarket-dumps -- --local
//
// Required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(__dirname, '..', '.env.local') });
dotenvConfig();

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(__dirname, '..');

// Cardmarket's public product catalog endpoints. The "_6" suffix is their
// internal Game ID for Pokémon TCG (Magic = 1, Yu-Gi-Oh = 3, etc.) — stable
// since the catalog format was introduced. If Cardmarket ever rotates the
// scheme, change the constants here and only here.
const S3_BASE = 'https://downloads.s3.cardmarket.com/productCatalog';
const URL_SINGLES = `${S3_BASE}/productList/products_singles_6.json`;
const URL_PRICING = `${S3_BASE}/priceGuide/price_guide_6.json`;

const LOCAL_EXPANSIONS = path.join(ROOT, 'cardmarket_expansions.json');
const LOCAL_SINGLES = path.join(ROOT, 'products_singles_6.json');
const LOCAL_PRICING = path.join(ROOT, 'price_guide_6.json');

const CHUNK = 1000;
const USE_LOCAL = process.argv.includes('--local');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

function service(): AnyClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCardPrefix(name: string): string {
  const i = name.indexOf(' [');
  return i === -1 ? name : name.slice(0, i);
}

interface CatalogShape { products: Array<{ idProduct: number; name: string; idExpansion: number; idMetacard: number }> }
interface PricingShape { priceGuides: Array<Record<string, number | null>> }

async function fetchJson<T>(url: string, label: string): Promise<T> {
  console.log(`  fetching ${label} from ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${res.statusText}`);
  const text = await res.text();
  console.log(`  ${label}: downloaded ${(text.length / 1024 / 1024).toFixed(1)} MB`);
  return JSON.parse(text) as T;
}

function readJson<T>(filepath: string, label: string): T {
  console.log(`  reading ${label} from ${filepath}`);
  return JSON.parse(readFileSync(filepath, 'utf-8')) as T;
}

interface ExpansionRow { id_expansion: number; name: string; name_normalized: string }
interface ProductRow { id_product: number; name: string; card_prefix: string; card_prefix_normalized: string; id_expansion: number; id_metacard: number | null }
interface PricingRow { id_product: number; low: number | null; trend: number | null; avg: number | null; avg1: number | null; avg7: number | null; avg30: number | null; low_holo: number | null; trend_holo: number | null; avg_holo: number | null; updated_at: string }

async function uploadInChunks<T>(
  supabase: AnyClient,
  table: string,
  rows: T[],
  conflictKey: string,
): Promise<void> {
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from(table).upsert(slice, { onConflict: conflictKey });
    if (error) throw new Error(`${table} upsert at offset ${i}: ${error.message}`);
    written += slice.length;
    process.stdout.write(`\r  ${table}: ${written}/${rows.length}`);
  }
  process.stdout.write('\n');
}

async function main(): Promise<void> {
  const supabase = service();

  console.log(`Loading dumps (mode: ${USE_LOCAL ? 'local' : 'S3'})...`);
  // Expansions are ALWAYS local — Cardmarket doesn't expose them via S3, the
  // mapping comes from the FR-locale dropdown and is committed in the repo.
  const expansionsMap = readJson<Record<string, string>>(LOCAL_EXPANSIONS, 'expansions (local, committed)');

  const catalog = USE_LOCAL
    ? readJson<CatalogShape>(LOCAL_SINGLES, 'singles catalog')
    : await fetchJson<CatalogShape>(URL_SINGLES, 'singles catalog');

  const pricing = USE_LOCAL
    ? readJson<PricingShape>(LOCAL_PRICING, 'pricing')
    : await fetchJson<PricingShape>(URL_PRICING, 'pricing');

  const expansionRows: ExpansionRow[] = Object.entries(expansionsMap).map(([id, name]) => ({
    id_expansion: Number(id),
    name,
    name_normalized: normalize(name),
  }));

  // Drop products whose expansion isn't in our dropdown — would FK-violate.
  // Cardmarket keeps very old expansions in the catalog forever; harmless —
  // EXCEPT when the unknown id is a freshly released set. Surface those
  // loudly so a new set doesn't sit priceless for weeks.
  const validExpansionIds = new Set(expansionRows.map((e) => e.id_expansion));
  const droppedByExpansion = new Map<number, number>();
  for (const p of catalog.products) {
    if (!validExpansionIds.has(p.idExpansion)) {
      droppedByExpansion.set(p.idExpansion, (droppedByExpansion.get(p.idExpansion) ?? 0) + 1);
    }
  }
  const droppedProducts = [...droppedByExpansion.values()].reduce((a, b) => a + b, 0);
  if (droppedByExpansion.size > 0) {
    console.warn(
      `\n⚠ ${droppedByExpansion.size} expansion id(s) in the dump are missing from cardmarket_expansions.json` +
      ` (${droppedProducts} products dropped).`,
    );
    const recent = [...droppedByExpansion.entries()].sort((a, b) => b[0] - a[0]).slice(0, 8);
    for (const [id, count] of recent) console.warn(`    id_expansion ${id}: ${count} products`);
    console.warn('  → run `npm run update-expansions` to pick up newly released sets.\n');
  }

  const productRows: ProductRow[] = catalog.products
    .filter((p) => validExpansionIds.has(p.idExpansion))
    .map((p) => {
      const prefix = extractCardPrefix(p.name);
      return {
        id_product: p.idProduct,
        name: p.name,
        card_prefix: prefix,
        card_prefix_normalized: normalize(prefix),
        id_expansion: p.idExpansion,
        id_metacard: p.idMetacard || null,
      };
    });

  const validProductIds = new Set(productRows.map((p) => p.id_product));
  const pricingRows: PricingRow[] = pricing.priceGuides
    .filter((p) => validProductIds.has(Number(p.idProduct)))
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

  console.log(`\nCounts: ${expansionRows.length} expansions, ${productRows.length} products (dropped ${droppedProducts} orphan), ${pricingRows.length} pricing rows`);

  console.log('\n[1/3] Uploading expansions...');
  await uploadInChunks(supabase, 'cardmarket_expansions', expansionRows, 'id_expansion');

  console.log('\n[2/3] Uploading products...');
  await uploadInChunks(supabase, 'cardmarket_products', productRows, 'id_product');

  console.log('\n[3/3] Uploading pricing...');
  await uploadInChunks(supabase, 'cardmarket_pricing', pricingRows, 'id_product');

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
