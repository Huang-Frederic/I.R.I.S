// scripts/restore-cardmarket-index.ts
//
// Restores cardmarket_card_index from backups/cardmarket_card_index.jsonl.gz.
// Asks for confirmation before TRUNCATEing.
//
// Usage: npm run restore-cardmarket-index

import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(__dirname, '..', '.env.local') });
dotenvConfig();
import { createReadStream } from 'node:fs';
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
const SNAPSHOT_PATH = path.join(BACKUPS_DIR, 'cardmarket_card_index.jsonl.gz');
const CHUNK_SIZE = 500;

async function countSnapshotRows(): Promise<number> {
  const stream = createReadStream(SNAPSHOT_PATH).pipe(createGunzip());
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

async function restoreCardmarketIndex(): Promise<number> {
  const service = createServiceClient();

  // No RPC for this table — use DELETE. The id_product PK is non-zero so
  // `.neq('id_product', 0)` matches everything.
  const { error: delErr } = await service.from('cardmarket_card_index').delete().neq('id_product', 0);
  if (delErr) throw new Error(`cardmarket_card_index delete failed: ${delErr.message}`);

  const stream = createReadStream(SNAPSHOT_PATH).pipe(createGunzip());
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let buffer: unknown[] = [];
  let total = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    buffer.push(JSON.parse(line));
    if (buffer.length >= CHUNK_SIZE) {
      const { error } = await service.from('cardmarket_card_index').insert(buffer);
      if (error) throw new Error(`insert chunk failed: ${error.message}`);
      total += buffer.length;
      buffer = [];
      process.stdout.write(`  inserted ${total} rows…\r`);
    }
  }
  if (buffer.length > 0) {
    const { error } = await service.from('cardmarket_card_index').insert(buffer);
    if (error) throw new Error(`insert final chunk failed: ${error.message}`);
    total += buffer.length;
  }
  process.stdout.write('\n');
  return total;
}

async function main(): Promise<void> {
  console.log('[restore-cardmarket-index] reading snapshot…');
  const expectedCount = await countSnapshotRows();
  console.log(`  snapshot contains ${expectedCount} cardmarket_card_index rows`);

  const ok = await confirm(
    `About to TRUNCATE cardmarket_card_index and restore ${expectedCount} rows. Continue?`,
  );
  if (!ok) {
    console.log('Aborted.');
    process.exit(0);
  }

  const inserted = await restoreCardmarketIndex();
  console.log(`  ✓ cardmarket_card_index: ${inserted} rows restored`);

  console.log('[restore-cardmarket-index] done.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[restore-cardmarket-index] FAILED:', err);
    process.exit(1);
  });
}
