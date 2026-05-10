/**
 * Backfill cardmarket_expansions.set_prefix for expansions whose URL slugs
 * don't follow the standard `-PREFIX{NUMBER}` convention (weird old promos,
 * CN sets) and so were left NULL by the SQL migration.
 *
 * Approach: for each NULL expansion, pick one product, fetch its cardmarket
 * page, parse the gallery <img src> which always contains the S3 prefix:
 *   https://product-images.s3.cardmarket.com/51/{set_prefix}/{id}/{id}.jpg
 *
 * Run: npx tsx scripts/fix-cardmarket-set-prefix.ts
 *
 * Cost: ~1 HTTP call per NULL expansion. Cardmarket rate-limits aggressively
 * so we keep concurrency low (3) and add a small delay between batches.
 * If you get 403s, set BRIGHTDATA_PROXY_URL in env to route through your
 * proxy.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env.local
const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CONCURRENCY = 3;
const BATCH_DELAY_MS = 500;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

type FetchResult =
  | { ok: true; prefix: string }
  | { ok: false; reason: string };

async function fetchPrefixForExpansion(
  idExpansion: number,
  _expName: string,
): Promise<FetchResult> {
  // First check: does the expansion have ANY cards in cardmarket_card_index?
  const { count } = await supabase
    .from('cardmarket_card_index')
    .select('*', { count: 'exact', head: true })
    .eq('id_expansion', idExpansion);
  if (count === 0 || count == null) {
    return { ok: false, reason: `0 cards in cardmarket_card_index (set never scraped)` };
  }

  // Try to grab one product with a non-null url_path.
  const { data: card } = await supabase
    .from('cardmarket_card_index')
    .select('url_path, id_product')
    .eq('id_expansion', idExpansion)
    .not('url_path', 'is', null)
    .limit(1)
    .maybeSingle();
  if (!card?.url_path) {
    return { ok: false, reason: `${count} cards exist but none have a url_path` };
  }

  const url = `https://www.cardmarket.com${card.url_path}`;
  try {
    const res = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return { ok: false, reason: `HTTP ${res.status} on ${url}` };
    }
    const html = await res.text();
    const m = html.match(
      /product-images\.s3\.cardmarket\.com\/51\/([^/]+)\/(\d+)\/\d+\.(jpg|webp|png)/i,
    );
    if (!m) {
      return { ok: false, reason: `page loaded but no S3 image URL in HTML (${url})` };
    }
    return { ok: true, prefix: m[1] };
  } catch (e) {
    return {
      ok: false,
      reason: `fetch error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function main() {
  const { data: nullExps, error } = await supabase
    .from('cardmarket_expansions')
    .select('id_expansion, name, name_en')
    .is('set_prefix', null)
    .order('id_expansion');
  if (error) throw error;
  if (!nullExps || nullExps.length === 0) {
    console.log('✓ No expansions with NULL set_prefix. Nothing to do.');
    return;
  }
  console.log(`Found ${nullExps.length} expansions with NULL set_prefix. Fetching…\n`);

  type Exp = { id_expansion: number; name: string; name_en: string | null };
  const exps = nullExps as Exp[];
  let fixed = 0;
  let failed = 0;

  // Process in concurrency-limited batches with delay between batches.
  for (let i = 0; i < exps.length; i += CONCURRENCY) {
    const batch = exps.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (e) => {
        const label = e.name_en ?? e.name;
        const result = await fetchPrefixForExpansion(e.id_expansion, label);
        if (result.ok) {
          const { error: updErr } = await supabase
            .from('cardmarket_expansions')
            .update({ set_prefix: result.prefix })
            .eq('id_expansion', e.id_expansion);
          if (updErr) {
            console.error(`  ✗ ${label} → update failed:`, updErr.message);
            failed++;
          } else {
            console.log(`  ✓ ${label} → "${result.prefix}"`);
            fixed++;
          }
        } else {
          console.log(`  - ${label} → ${result.reason}`);
          failed++;
        }
      }),
    );
    if (i + CONCURRENCY < exps.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  console.log(`\nDone. ${fixed} fixed, ${failed} still NULL.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
