// Restores tcg_catalog + rarity_ranks from backups/.
// Asks for confirmation before TRUNCATEing.
//
// Usage: npm run restore-catalog

import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(__dirname, '..', '.env.local') });
dotenvConfig();
import { createReadStream, readFileSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
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
const CHUNK_SIZE = 500;

async function countSnapshotRows(): Promise<number> {
  const stream = createReadStream(path.join(BACKUPS_DIR, 'tcg_catalog.jsonl.gz')).pipe(
    createGunzip(),
  );
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let count = 0;
  for await (const line of rl) {
    if (line.trim()) count += 1;
  }
  return count;
}

async function confirm(message: string): Promise<boolean> {
  if (process.env.SKIP_CONFIRM === '1') return true;
  process.stdout.write(message + ' [y/N] ');
  const answer = await new Promise<string>((resolve) => {
    process.stdin.once('data', (data) => resolve(data.toString().trim().toLowerCase()));
  });
  return answer === 'y' || answer === 'yes';
}

async function restoreTcgCatalog(): Promise<number> {
  const service = createServiceClient();

  // Try RPC first; fall back to DELETE
  const { error: truncErr } = await service.rpc('truncate_tcg_catalog');
  if (truncErr) {
    const { error: delErr } = await service.from('tcg_catalog').delete().neq('id', 0);
    if (delErr) throw new Error(`truncate fallback failed: ${delErr.message}`);
  }

  const stream = createReadStream(path.join(BACKUPS_DIR, 'tcg_catalog.jsonl.gz')).pipe(
    createGunzip(),
  );
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let buffer: unknown[] = [];
  let total = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    buffer.push(JSON.parse(line));
    if (buffer.length >= CHUNK_SIZE) {
      const { error } = await service.from('tcg_catalog').insert(buffer);
      if (error) throw new Error(`insert chunk failed: ${error.message}`);
      total += buffer.length;
      buffer = [];
      process.stdout.write(`  inserted ${total} rows…\r`);
    }
  }
  if (buffer.length > 0) {
    const { error } = await service.from('tcg_catalog').insert(buffer);
    if (error) throw new Error(`insert final chunk failed: ${error.message}`);
    total += buffer.length;
  }
  process.stdout.write('\n');
  return total;
}

async function restoreRarityRanks(): Promise<number> {
  const service = createServiceClient();
  const rows = JSON.parse(
    readFileSync(path.join(BACKUPS_DIR, 'rarity_ranks.json'), 'utf-8'),
  ) as unknown[];
  const { error: delErr } = await service.from('rarity_ranks').delete().neq('rarity', '');
  if (delErr) throw new Error(`rarity_ranks delete failed: ${delErr.message}`);
  if (rows.length > 0) {
    const { error } = await service.from('rarity_ranks').insert(rows);
    if (error) throw new Error(`rarity_ranks insert failed: ${error.message}`);
  }
  return rows.length;
}

async function main(): Promise<void> {
  console.log('[restore-catalog] reading snapshot…');
  const expectedCount = await countSnapshotRows();
  console.log(`  snapshot contains ${expectedCount} tcg_catalog rows`);

  const ok = await confirm(
    `About to TRUNCATE tcg_catalog + rarity_ranks and restore ${expectedCount} rows. Continue?`,
  );
  if (!ok) {
    console.log('Aborted.');
    process.exit(0);
  }

  const inserted = await restoreTcgCatalog();
  console.log(`  ✓ tcg_catalog: ${inserted} rows restored`);

  const rarityCount = await restoreRarityRanks();
  console.log(`  ✓ rarity_ranks: ${rarityCount} rows restored`);

  console.log('[restore-catalog] done.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[restore-catalog] FAILED:', err);
    process.exit(1);
  });
}
