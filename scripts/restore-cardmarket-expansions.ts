// Restores cardmarket_expansions from backups/cardmarket_expansions.jsonl.gz.
//
// Why dedicated: cardmarket_expansions.set_prefix is populated by the BrightData
// scraper (~30 min + ~$1 of credits to repopulate from scratch). The daily
// `npm run upload-cardmarket-dumps` cron only writes name/name_normalized via
// partial upsert — it preserves set_prefix on existing rows but wouldn't restore
// it on a fresh DB.
//
// Strategy: UPSERT (not DELETE+INSERT) — cardmarket_products has an FK on
// id_expansion, so a delete would cascade. Upsert overwrites the dump-derived
// columns (name, name_normalized) with snapshot values, which is fine because
// they're idempotent vs the daily dump.
//
// Usage: npm run restore-cardmarket-expansions

import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(__dirname, '..', '.env.local') });
dotenvConfig();
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { createClient } from '@supabase/supabase-js';

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const BACKUPS_DIR = path.resolve(__dirname, '..', 'backups');
const SNAPSHOT_PATH = path.join(BACKUPS_DIR, 'cardmarket_expansions.jsonl.gz');
const CHUNK_SIZE = 200;

async function confirm(message: string): Promise<boolean> {
  if (process.env.SKIP_CONFIRM === '1') return true;
  process.stdout.write(message + ' [y/N] ');
  const answer = await new Promise<string>((resolve) => {
    process.stdin.once('data', (data) => resolve(data.toString().trim().toLowerCase()));
  });
  return answer === 'y' || answer === 'yes';
}

async function readSnapshot(): Promise<unknown[]> {
  const stream = createReadStream(SNAPSHOT_PATH).pipe(createGunzip());
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  const rows: unknown[] = [];
  for await (const line of rl) {
    if (line.trim()) rows.push(JSON.parse(line));
  }
  return rows;
}

async function restoreCardmarketExpansions(): Promise<number> {
  const service = createServiceClient();
  const rows = await readSnapshot();
  let total = 0;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await service
      .from('cardmarket_expansions')
      .upsert(chunk, { onConflict: 'id_expansion' });
    if (error) throw new Error(`upsert chunk ${i} failed: ${error.message}`);
    total += chunk.length;
    process.stdout.write(`  upserted ${total} rows…\r`);
  }
  process.stdout.write('\n');
  return total;
}

async function main(): Promise<void> {
  console.log('[restore-cardmarket-expansions] reading snapshot…');
  const rows = await readSnapshot();
  const withPrefix = rows.filter(
    (r) => (r as { set_prefix?: string | null }).set_prefix,
  ).length;
  console.log(`  snapshot contains ${rows.length} expansions (${withPrefix} with set_prefix)`);

  const ok = await confirm(
    `About to UPSERT ${rows.length} rows into cardmarket_expansions (overwrites name/name_normalized/set_prefix on conflicts). Continue?`,
  );
  if (!ok) {
    console.log('Aborted.');
    process.exit(0);
  }

  const upserted = await restoreCardmarketExpansions();
  console.log(`  ✓ cardmarket_expansions: ${upserted} rows upserted`);
  console.log('[restore-cardmarket-expansions] done.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[restore-cardmarket-expansions] FAILED:', err);
    process.exit(1);
  });
}
