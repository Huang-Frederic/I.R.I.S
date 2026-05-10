/**
 * Generates a scraper input JSON for cardmarket_expansions that have no cards
 * indexed yet (set_prefix IS NULL).
 *
 * Output: scrapers/cardmarket/.actor/RESCRAPE_INPUT.json — paste this into
 * Apify's "Input" tab when you run the actor (or pass it via the local CLI).
 *
 * Slug derivation: cardmarket FR URLs use the expansion name with spaces
 * replaced by dashes, accents preserved (e.g. "Pokémon-Card-151"). For names
 * with special chars (colons, plus signs), we strip them — best-effort, may
 * need manual editing for a few.
 *
 * Excludes FR localisations (the EN set is already scraped — duplicate data).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
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
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const OUTPUT_PATH = resolve(__dirname, '../scrapers/cardmarket/.actor/RESCRAPE_INPUT.json');

interface ExpansionRow {
  id_expansion: number;
  name: string;        // FR (cardmarket FR locale)
  name_en: string | null;
  name_ja: string | null;
}

/**
 * Build the cardmarket URL slug.
 *
 * Cardmarket URLs use the ENGLISH name even on the /fr/ locale (verified
 * against scraped url_paths: "Zénith Suprême" → "Crown-Zenith", "Évolutions
 * à Paldea" → "Paldea-Evolved"). They also strip diacritics, apostrophes
 * and `&`, and collapse the rest with single dashes.
 *
 * Examples (name_en → slug):
 *   "Crown Zenith" → "Crown-Zenith"
 *   "McDonald's Match Battle 2023" → "McDonalds-Match-Battle-2023"
 *   "Pokémon Card 151" → "Pokemon-Card-151"
 *   "ex Starter Set Sprigatito & Lucario ex" → "ex-Starter-Set-Sprigatito-Lucario-ex"
 */
function slugify(nameEn: string): string {
  return nameEn
    .normalize('NFD')                  // decompose accents
    .replace(/[̀-ͯ]/g, '')   // strip combining marks (é → e)
    .replace(/['']/g, '')              // strip apostrophes (curly + straight)
    .replace(/[^A-Za-z0-9-\s]/g, ' ')  // anything not letter/digit/dash/space → space
    .replace(/\s+/g, '-')              // spaces → dashes
    .replace(/--+/g, '-')              // collapse multi-dashes
    .replace(/^-+|-+$/g, '');          // trim leading/trailing dashes
}

/**
 * Identify FR-localised duplicates (Académie de Combat, Poing de Fusion, …).
 * These ARE listed in cardmarket_expansions but represent the same physical
 * cards as their EN counterpart, which is already scraped. Skipping avoids
 * doubled product entries.
 *
 * Heuristic: name (FR) clearly differs from name_en in a "translation" way.
 * Specific known patterns plus a generic "Produits ..." prefix used for
 * sealed-product expansions.
 */
function isFrLocalisation(row: ExpansionRow): boolean {
  if (!row.name_en) return false;
  const fr = row.name.toLowerCase();
  const en = row.name_en.toLowerCase();
  if (fr === en) return false;

  // Sealed-product expansions whose FR name starts with "Produits"
  if (/^produits\s/i.test(row.name)) return true;
  // FR Trainer Kits
  if (/kit\s+(du\s+)?dresseur/i.test(row.name)) return true;
  // FR Battle Academy
  if (/^académie de combat/i.test(row.name)) return true;
  // FR translations of named SV-era sets
  if (/^poing de fusion$/i.test(row.name)) return true;
  if (/^mon premier combat$/i.test(row.name)) return true;
  // Other FR-translated card-pack names containing "Pokémon Packs Récompense"
  if (/pokémon\s+packs?\s+récompense/i.test(row.name)) return true;
  return false;
}

async function main() {
  // Optional filter: --min-id N → only include expansions with id >= N.
  // Useful for prioritising SV-era modern sets first (>= 5200 ≈ late 2022+).
  const minIdArg = process.argv.find((a) => a.startsWith('--min-id='));
  const minId = minIdArg ? Number(minIdArg.split('=')[1]) : 0;

  let query = supabase
    .from('cardmarket_expansions')
    .select('id_expansion, name, name_en, name_ja')
    .is('set_prefix', null)
    .order('id_expansion');
  if (minId > 0) query = query.gte('id_expansion', minId);

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as ExpansionRow[];

  if (minId > 0) {
    console.log(`Filtering to id_expansion >= ${minId}\n`);
  }

  const skipped: ExpansionRow[] = [];
  const toScrape: ExpansionRow[] = [];
  for (const r of rows) {
    if (isFrLocalisation(r)) skipped.push(r);
    else toScrape.push(r);
  }

  const expansions = toScrape.map((r) => ({
    idExpansion: r.id_expansion,
    name: r.name_en ?? r.name,
    // Cardmarket slugs are derived from the EN name (even on /fr/ locale).
    slug: slugify(r.name_en ?? r.name),
  }));

  const input = {
    expansions,
    skipExisting: true,   // safety net: if scraping ran already for one, skip it
    concurrency: 3,
    // 30 is the cardmarket default — higher values silently fail or get
    // capped on certain expansions (verified empirically).
    perPage: 30,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(input, null, 2));
  console.log(`✓ Wrote ${OUTPUT_PATH}`);
  console.log(`  ${toScrape.length} expansions to scrape`);
  console.log(`  ${skipped.length} FR localisations skipped`);

  if (skipped.length > 0) {
    console.log('\nFR localisations skipped:');
    for (const r of skipped) {
      console.log(`  - ${r.name} (${r.name_en})`);
    }
  }
  console.log('\nNext steps:');
  console.log(`  1. Review ${OUTPUT_PATH} — verify a few slugs are sensible`);
  console.log(`  2. Run scraper with that file as input:`);
  console.log(`     - Apify cloud: paste content into actor's Input tab`);
  console.log(`     - Locally: cd scrapers/cardmarket && APIFY_LOCAL_STORAGE_DIR=./storage npx apify run --input-file=../../scrapers/cardmarket/.actor/RESCRAPE_INPUT.json`);
  console.log(`  3. After scrape, re-run: npx tsx scripts/fix-cardmarket-set-prefix.ts (no-op if migration filled them)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
