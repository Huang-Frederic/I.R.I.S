/**
 * The engine — reads THE LIST (sources.ts), runs each extractor, and mirrors
 * its events into the `store_events` table. Never touched when adding a shop.
 *
 * Per source, on SUCCESS, it replaces that source's rows (delete + insert) so
 * cancelled/removed events disappear. On FAILURE it leaves the existing rows
 * untouched — a shop being briefly down must not wipe its events from IRIS.
 *
 * Usage:
 *   npx tsx scripts/store-events/core.ts             # scrape + write to Supabase
 *   npx tsx scripts/store-events/core.ts --dry-run   # scrape + print, no writes
 *
 * Env (for writes): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(__dirname, '..', '..', '.env.local') });
dotenvConfig();

import { createClient } from '@supabase/supabase-js';
import { SOURCES } from './sources';
import type { Source, StoreEvent } from './types';

const DRY_RUN = process.argv.includes('--dry-run');
// CI (GitHub Action) passes --no-browser: skip the JS-rendered shops that need
// a headless browser. Those run on the WSL box alongside the Vinted agent.
const NO_BROWSER = process.argv.includes('--no-browser');

function toRow(e: StoreEvent) {
  return {
    source: e.source,
    shop_name: e.shopName,
    city: e.city,
    title: e.title,
    event_type: e.eventType,
    starts_at: e.startsAt,
    ends_at: e.endsAt ?? null,
    spots_left: e.spotsLeft ?? null,
    url: e.url,
    price: e.price,
    external_id: e.externalId,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function writeSource(supabase: any, source: Source, events: StoreEvent[]): Promise<void> {
  // Replace this source's rows atomically-ish: delete then insert. Only reached
  // when the extractor succeeded, so a transient failure never empties a shop.
  const { error: delErr } = await supabase.from('store_events').delete().eq('source', source.id);
  if (delErr) throw new Error(`delete ${source.id}: ${delErr.message}`);
  if (events.length === 0) return;
  const { error: insErr } = await supabase.from('store_events').upsert(events.map(toRow), {
    onConflict: 'external_id',
  });
  if (insErr) throw new Error(`insert ${source.id}: ${insErr.message}`);
}

async function main(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let supabase: any = null;
  if (!DRY_RUN) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY must be set (or pass --dry-run)');
    }
    supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  const collected: StoreEvent[] = [];
  let okSources = 0;
  let failSources = 0;

  for (const source of SOURCES) {
    if (source.needsBrowser && NO_BROWSER) {
      console.log(`↷ ${source.name}: ignoré (--no-browser)`);
      continue;
    }
    try {
      const events = await source.extract(source);
      const dated = events.filter((e) => e.startsAt !== null).length;
      console.log(`✓ ${source.name}: ${events.length} événement(s) (${dated} datés)`);
      if (!DRY_RUN) await writeSource(supabase, source, events);
      collected.push(...events);
      okSources += 1;
    } catch (e) {
      failSources += 1;
      console.error(`✗ ${source.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\n${okSources}/${SOURCES.length} sources OK${failSources ? `, ${failSources} en échec` : ''} — ${collected.length} événements au total.`);

  if (DRY_RUN) {
    const upcoming = collected
      .filter((e) => e.startsAt)
      .sort((a, b) => a.startsAt!.localeCompare(b.startsAt!));
    console.log('\nProchains événements datés :');
    for (const e of upcoming.slice(0, 30)) {
      console.log(`  ${e.startsAt!.slice(0, 16).replace('T', ' ')}  [${e.eventType ?? '?'}]  ${e.title}  — ${e.shopName}`);
    }
    const undated = collected.filter((e) => !e.startsAt);
    if (undated.length) console.log(`\n(${undated.length} sans date parsée, ex: "${undated[0].title}")`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
