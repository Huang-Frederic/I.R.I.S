/**
 * add-expansion-from-dump — teaches IRIS a freshly released set from
 * Cardmarket's public S3 dumps alone, without BrightData (the account was
 * deactivated in October 2026, so update-cardmarket-expansions can no
 * longer read the expansion dropdowns or scrape the galleries).
 *
 * The dumps carry every product with its idExpansion, but neither the
 * expansion's name nor any collector number:
 *   - the names and the printed set code come from you (--name, --name-en,
 *     --prefix — the code printed on the cards, which is also Cardmarket's
 *     set_prefix for every recent set: MEG, PFL, ASC, POR, CRI, PBL);
 *   - the numbers come from the order Cardmarket creates a set's products
 *     in: sorted by idProduct, product n is card n. Checked against the
 *     scraped index on 2026-10-27: exact on MEG, PFL, POR, CRI and PBL, a few
 *     swapped secret rares on ASC (see docs/CARDMARKET_MAPPING.md).
 *
 * That only holds for a set with one product per card, so --cards (the
 * official card count, secret rares included) must equal the number of
 * products or nothing is written. Unlike the SQL formula in
 * CARDMARKET_MAPPING.md it doesn't merge consecutive same-name products:
 * Delta Reign's Legendary Stadiums are two cards each ("Legendary Summit
 * [Left]" 96 and "[Right]" 97).
 *
 * Check the numbered list a --dry-run prints against the official card list
 * (Bulbapedia's set page) before writing.
 *
 * What a run writes: the id in cardmarket_expansions.json (commit it — the
 * nightly upload drops the products of unknown expansions), the expansion
 * row, its products, their prices and one cardmarket_card_index row per
 * card (url_path left NULL, like the SQL formula's rows).
 *
 * Usage:
 *   npm run add-expansion -- --id=6704 --name="Règne Delta" --name-en="Delta Reign" \
 *     --prefix=DLR --cards=141 --dry-run
 *
 * Required env (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(__dirname, '..', '.env.local') });
dotenvConfig();

import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { normalize } from './update-cardmarket-expansions';

const ROOT = path.resolve(__dirname, '..');
const EXPANSIONS_JSON = path.join(ROOT, 'cardmarket_expansions.json');
const S3_BASE = 'https://downloads.s3.cardmarket.com/productCatalog';
const URL_SINGLES = `${S3_BASE}/productList/products_singles_6.json`;
const URL_PRICING = `${S3_BASE}/priceGuide/price_guide_6.json`;
const CHUNK = 500;

/* ----------------------------- pure helpers ----------------------------- */

export interface DumpProduct {
  idProduct: number;
  name: string;
  idExpansion: number;
  idMetacard: number;
}

export interface NumberedProduct {
  setNumber: number;
  product: DumpProduct;
}

/** Same split as upload-cardmarket-dumps: "Pikachu [Thunder]" → "Pikachu". */
export function cardPrefix(name: string): string {
  const i = name.indexOf(' [');
  return i === -1 ? name : name.slice(0, i);
}

/**
 * The expansion's products in idProduct order, product n numbered n. Throws
 * when the product count isn't the official card count: the order then says
 * nothing reliable about the numbers.
 */
export function numberProducts(products: DumpProduct[], idExpansion: number, cards: number): NumberedProduct[] {
  const own = products.filter((p) => p.idExpansion === idExpansion).sort((a, b) => a.idProduct - b.idProduct);
  if (own.length === 0) {
    throw new Error(`No product of expansion ${idExpansion} in the dump — wrong id, or not on Cardmarket yet.`);
  }
  if (own.length !== cards) {
    throw new Error(
      `Expansion ${idExpansion} has ${own.length} products for ${cards} cards: numbering by product order ` +
        'only works with one product per card. Nothing written.',
    );
  }
  return own.map((product, i) => ({ setNumber: i + 1, product }));
}

export function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (m) out[m[1]] = m[2] ?? 'true';
  }
  return out;
}

/* ----------------------------- impure parts ----------------------------- */

interface PricingShape {
  priceGuides: Array<Record<string, number | null>>;
}

async function fetchJson<T>(url: string, label: string): Promise<T> {
  console.log(`  fetching ${label}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function uploadInChunks(supabase: any, table: string, rows: unknown[], conflictKey: string): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + CHUNK), { onConflict: conflictKey });
    if (error) throw new Error(`${table} upsert at offset ${i}: ${error.message}`);
  }
  console.log(`  ${table}: ${rows.length} rows`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const idExpansion = Number(args.id);
  const cards = Number(args.cards);
  const name = args.name;
  const prefix = args.prefix?.toUpperCase();
  if (!Number.isInteger(idExpansion) || !Number.isInteger(cards) || !name || !prefix) {
    throw new Error(
      'Usage: npm run add-expansion -- --id=<idExpansion> --name="<nom FR>" [--name-en="<EN name>"] ' +
        '--prefix=<printed code> --cards=<official card count> [--dry-run]',
    );
  }
  const dryRun = args['dry-run'] === 'true';

  console.log('[1/4] Loading the singles dump...');
  const catalog = await fetchJson<{ products: DumpProduct[] }>(URL_SINGLES, 'singles catalog');
  const numbered = numberProducts(catalog.products, idExpansion, cards);
  for (const { setNumber, product } of numbered) {
    console.log(`  ${prefix}${String(setNumber).padStart(3, '0')}  ${product.idProduct}  ${product.name}`);
  }
  if (dryRun) {
    console.log('\n--dry-run: check these numbers against the official card list, then run without --dry-run.');
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in ${path.join(ROOT, '.env.local')}`);
  }
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });

  console.log('\n[2/4] cardmarket_expansions.json + expansion row...');
  const committed = JSON.parse(readFileSync(EXPANSIONS_JSON, 'utf-8')) as Record<string, string>;
  if (committed[String(idExpansion)] !== name) {
    // Integer-like keys serialize in ascending numeric order, like the committed file.
    writeFileSync(EXPANSIONS_JSON, JSON.stringify({ ...committed, [idExpansion]: name }, null, 2) + '\n');
    console.log('  cardmarket_expansions.json updated — COMMIT THIS FILE.');
  }
  await uploadInChunks(supabase, 'cardmarket_expansions', [{
    id_expansion: idExpansion,
    name,
    name_normalized: normalize(name),
    ...(args['name-en'] ? { name_en: args['name-en'] } : {}),
    set_prefix: prefix,
  }], 'id_expansion');

  console.log('\n[3/4] Products + prices...');
  await uploadInChunks(supabase, 'cardmarket_products', numbered.map(({ product: p }) => {
    const cp = cardPrefix(p.name);
    return {
      id_product: p.idProduct,
      name: p.name,
      card_prefix: cp,
      card_prefix_normalized: normalize(cp),
      id_expansion: p.idExpansion,
      id_metacard: p.idMetacard || null,
    };
  }), 'id_product');
  const pricing = await fetchJson<PricingShape>(URL_PRICING, 'pricing');
  const ids = new Set(numbered.map(({ product }) => product.idProduct));
  await uploadInChunks(supabase, 'cardmarket_pricing', pricing.priceGuides
    .filter((p) => ids.has(Number(p.idProduct)))
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
    })), 'id_product');

  console.log('\n[4/4] cardmarket_card_index...');
  await uploadInChunks(supabase, 'cardmarket_card_index', numbered.map(({ setNumber, product }) => ({
    id_product: product.idProduct,
    id_expansion: idExpansion,
    set_number: String(setNumber),
    url_variant: null,
    language: 'fr',
    url_path: null,
  })), 'id_product');

  const { count } = await supabase
    .from('cardmarket_card_index')
    .select('id_product', { count: 'exact', head: true })
    .eq('id_expansion', idExpansion);
  console.log(`\nVerification: ${count ?? 0}/${cards} index rows for ${idExpansion} (${prefix}).`);
  console.log('\nNext steps:');
  console.log('  - git add cardmarket_expansions.json && commit (else the nightly upload drops the products)');
  console.log('  - npm run snapshot-cardmarket-index');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
