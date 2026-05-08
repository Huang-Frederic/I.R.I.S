// scripts/snapshot-cardmarket-index.ts
//
// Streams all rows of cardmarket_card_index to a versioned file in backups/.
// Run after a successful gallery scrape (`npm run scrape-cardmarket -- --modern`
// or `--all`) so the hours of work + Cloudflare-1015 risk are protected.
//
// Why a dedicated snapshot: the daily GitHub Action backup only covers the 8
// user-data tables (cards, lots, listings, etc.). cardmarket_card_index is
// catalog data that takes ~6h (modern) or ~16h (all expansions) to rebuild
// from scratch and risks an IP ban — losing it without a snapshot is painful.
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

async function main(): Promise<void> {
  mkdirSync(BACKUPS_DIR, { recursive: true });

  console.log('[snapshot-cardmarket-index] starting…');
  const count = await snapshotCardmarketIndex();
  console.log(`  ✓ cardmarket_card_index: ${count} rows → backups/cardmarket_card_index.jsonl.gz`);
  console.log('[snapshot-cardmarket-index] done. Commit backups/ to git.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[snapshot-cardmarket-index] FAILED:', err);
    process.exit(1);
  });
}
