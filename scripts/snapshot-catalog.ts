// Streams all rows of tcg_catalog + rarity_ranks to versioned files
// in backups/. Run after every full re-scrape.
//
// Usage: npm run snapshot-catalog

import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
// Load .env.local first (Next.js convention), then .env as fallback
dotenvConfig({ path: path.resolve(__dirname, '..', '.env.local') });
dotenvConfig();
import { createWriteStream, writeFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createClient } from '@supabase/supabase-js';

// Scripts can't import lib/supabase/service.ts (it has `server-only` which
// throws under tsx). Create the service-role client inline here — safe because
// scripts only run on the developer machine with .env.local.
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

// Pure helpers (exported for testing)
export function encodeJsonlLine(row: unknown): string {
  return JSON.stringify(row) + '\n';
}

export function decodeJsonlLine(line: string): unknown {
  return JSON.parse(line);
}

async function snapshotTcgCatalog(): Promise<number> {
  const service = createServiceClient();
  const out = createWriteStream(path.join(BACKUPS_DIR, 'tcg_catalog.jsonl.gz'));
  const gzip = createGzip();

  const lineGenerator = async function* () {
    let from = 0;
    while (true) {
      const { data, error } = await service
        .from('tcg_catalog')
        .select('*')
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(`tcg_catalog read failed: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const row of data) {
        yield encodeJsonlLine(row);
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

async function snapshotRarityRanks(): Promise<number> {
  const service = createServiceClient();
  const { data, error } = await service.from('rarity_ranks').select('*');
  if (error) throw new Error(`rarity_ranks read failed: ${error.message}`);
  writeFileSync(
    path.join(BACKUPS_DIR, 'rarity_ranks.json'),
    JSON.stringify(data ?? [], null, 2),
  );
  return data?.length ?? 0;
}

async function main(): Promise<void> {
  mkdirSync(BACKUPS_DIR, { recursive: true });

  console.log('[snapshot-catalog] starting…');
  const catalogCount = await snapshotTcgCatalog();
  console.log(`  ✓ tcg_catalog: ${catalogCount} rows → backups/tcg_catalog.jsonl.gz`);

  const rarityCount = await snapshotRarityRanks();
  console.log(`  ✓ rarity_ranks: ${rarityCount} rows → backups/rarity_ranks.json`);

  console.log('[snapshot-catalog] done. Commit backups/ to git.');
}

// Only run main if this script is executed directly (not imported by tests)
if (require.main === module) {
  main().catch((err) => {
    console.error('[snapshot-catalog] FAILED:', err);
    process.exit(1);
  });
}
