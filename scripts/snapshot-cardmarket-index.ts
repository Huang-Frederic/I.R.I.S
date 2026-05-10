// Snapshot the two scrape-derived cardmarket tables to versioned files in backups/:
//   - cardmarket_card_index (~48K rows of (expansion, set_number) → id_product)
//   - cardmarket_expansions  (741 rows, INCLUDES the set_prefix column we
//                             populate from BrightData scraping — the daily
//                             dump upload preserves it via partial upsert,
//                             but a full table reset/restore would lose it)
//
// Run after a successful BrightData scrape (`scrapers/cardmarket/`) — the
// hours of work + ~$3 of BrightData credits + Cloudflare-1015 risk are then
// protected.
//
// The daily GitHub Action backup only covers the 8 user-data tables
// (cards, lots, listings, etc.). The cardmarket scrape data isn't in there.
//
// Usage: npm run snapshot-cardmarket-index

import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(__dirname, '..', '.env.local') });
dotenvConfig();
import { createWriteStream, mkdirSync } from 'node:fs';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createClient } from '@supabase/supabase-js';

// See snapshot-catalog.ts for the rationale on inlining the client.
function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const BACKUPS_DIR = path.resolve(__dirname, '..', 'backups');
const PAGE_SIZE = 1000;

async function snapshotCardmarketIndex(): Promise<number> {
  const service = createServiceClient();
  const out = createWriteStream(path.join(BACKUPS_DIR, 'cardmarket_card_index.jsonl.gz'));
  const gzip = createGzip();

  const lineGenerator = async function* () {
    let from = 0;
    while (true) {
      const { data, error } = await service
        .from('cardmarket_card_index')
        .select('*')
        .order('id_product', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(`cardmarket_card_index read failed: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const row of data) {
        yield JSON.stringify(row) + '\n';
      }
      if (data.length < PAGE_SIZE) {
        return;
      }
      from += PAGE_SIZE;
    }
  };

  let count = 0;
  const source = Readable.from(
    (async function* () {
      const gen = lineGenerator();
      for await (const line of gen) {
        count += 1;
        yield line;
      }
    })(),
  );

  await pipeline(source, gzip, out);
  return count;
}

/**
 * Snapshot cardmarket_expansions. Small enough (~741 rows) for a single query
 * — no streaming pagination needed. We dump the FULL row including set_prefix
 * which is the column that costs $1+ of BrightData credits to repopulate.
 */
async function snapshotCardmarketExpansions(): Promise<number> {
  const service = createServiceClient();
  const { data, error } = await service
    .from('cardmarket_expansions')
    .select('*')
    .order('id_expansion', { ascending: true });
  if (error) throw new Error(`cardmarket_expansions read failed: ${error.message}`);
  const rows = data ?? [];

  const out = createWriteStream(path.join(BACKUPS_DIR, 'cardmarket_expansions.jsonl.gz'));
  const gzip = createGzip();
  const source = Readable.from(rows.map((r) => JSON.stringify(r) + '\n'));
  await pipeline(source, gzip, out);
  return rows.length;
}

async function main(): Promise<void> {
  mkdirSync(BACKUPS_DIR, { recursive: true });

  console.log('[snapshot-cardmarket] starting…');
  const indexCount = await snapshotCardmarketIndex();
  console.log(`  ✓ cardmarket_card_index: ${indexCount} rows → backups/cardmarket_card_index.jsonl.gz`);
  const expansionCount = await snapshotCardmarketExpansions();
  console.log(`  ✓ cardmarket_expansions: ${expansionCount} rows → backups/cardmarket_expansions.jsonl.gz`);
  console.log('[snapshot-cardmarket] done. Commit backups/ to git.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[snapshot-cardmarket-index] FAILED:', err);
    process.exit(1);
  });
}
