// One-shot diagnostic: lists all expected tables, counts rows, flags missing
// tables and unexpected ones. Uses raw fetch against the PostgREST endpoint
// to avoid the supabase-js Realtime client bootstrap (which fails on Node 18).
//
// Usage: npx tsx scripts/check-supabase-state.ts

import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(__dirname, '..', '.env.local') });
dotenvConfig();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) throw new Error('NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');

const REST = `${URL}/rest/v1`;
const HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
};

// Tables we EXPECT to exist based on the migrations chain
const EXPECTED_TABLES = [
  // Core (initial_schema + phase4_multi_user)
  'user_profiles',
  'cards',
  'lots',
  'card_listings',
  'lot_listings',
  // Catalog (tcg_catalog migration)
  'tcg_catalog',
  // Dashboard time-series tables
  'ocr_usage_log',
  'stock_value_snapshots',
  // Cardmarket pricing pipeline
  'cardmarket_expansions',
  'cardmarket_products',
  'cardmarket_pricing',
  'cardmarket_card_index',
] as const;

/**
 * Count rows via PostgREST HEAD request with Prefer: count=exact.
 * Response includes Content-Range header with the total row count.
 */
async function countRows(table: string): Promise<number | string> {
  try {
    const res = await fetch(`${REST}/${table}?select=*`, {
      method: 'HEAD',
      headers: { ...HEADERS, Prefer: 'count=exact', Range: '0-0' },
    });
    if (!res.ok && res.status !== 206) {
      const body = await res.text().catch(() => '');
      return `HTTP ${res.status} ${body.slice(0, 80)}`;
    }
    const range = res.headers.get('content-range');
    if (!range) return 'no Content-Range';
    const total = range.split('/').pop();
    if (total == null || total === '*') return 0;
    return parseInt(total, 10);
  } catch (e) {
    return `THROW: ${(e as Error).message}`;
  }
}

async function distinctExpansionsScraped(): Promise<number | null> {
  const res = await fetch(`${REST}/cardmarket_card_index?select=id_expansion&limit=100000`, {
    headers: HEADERS,
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ id_expansion: number }>;
  return new Set(data.map((r) => r.id_expansion)).size;
}

async function main(): Promise<void> {
  console.log('Checking expected tables...\n');
  console.log('TABLE'.padEnd(30) + 'STATUS');
  console.log('-'.repeat(60));

  const missing: string[] = [];
  const present: string[] = [];

  for (const t of EXPECTED_TABLES) {
    const result = await countRows(t);
    const status = typeof result === 'number' ? `${result.toLocaleString()} rows` : `❌ ${result}`;
    console.log(t.padEnd(30) + status);
    if (typeof result === 'string') {
      missing.push(t);
    } else {
      present.push(t);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Present: ${present.length}/${EXPECTED_TABLES.length}`);
  if (missing.length > 0) {
    console.log(`Missing: ${missing.join(', ')}`);
    console.log('  → Apply the corresponding migration(s) in Supabase SQL Editor.');
  }

  // Cardmarket scrape readiness
  console.log('\n' + '='.repeat(60));
  console.log('Cardmarket scrape readiness:');

  const cmProducts = await countRows('cardmarket_products');
  const cmIndex = await countRows('cardmarket_card_index');

  if (typeof cmProducts === 'number' && cmProducts > 60_000) {
    console.log(`  ✓ Dumps loaded (${cmProducts.toLocaleString()} products)`);
  } else {
    console.log(`  ✗ Dumps not loaded — run: npm run upload-cardmarket-dumps`);
  }

  if (typeof cmIndex === 'number' && cmIndex > 0) {
    const expCount = await distinctExpansionsScraped();
    console.log(
      `  ⏳ Index partial: ${cmIndex.toLocaleString()} rows across ${expCount ?? '?'} expansions`,
    );
    console.log(`     → continue: npm run scrape-cardmarket -- --modern (resume-safe)`);
  } else if (typeof cmIndex === 'number') {
    console.log(`  ✗ Index empty — run: npm run scrape-cardmarket -- --modern`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
