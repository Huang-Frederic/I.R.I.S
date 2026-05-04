// scripts/scrape-limitlesstcg.ts
/**
 * Bootstrap script — populates tcg_catalog from LimitlessTCG (limitlesstcg.com).
 *
 * Modes (set MODE env var):
 *   MODE=probe (default): scrape ONE set + dump parsed rows, NO writes
 *   MODE=full:            crawl all sets across languages + upsert to Supabase
 *                          (implemented in Task 9, currently a stub)
 *
 * Usage:
 *   npx tsx scripts/scrape-limitlesstcg.ts                      # probe SV11W JP
 *   SET=BW5n PROBE_LANG=jp npx tsx scripts/scrape-limitlesstcg.ts # probe BW5n JP
 *   MODE=full npx tsx scripts/scrape-limitlesstcg.ts            # full crawl
 *
 * Robots.txt is fully permissive (`Disallow:` empty). We rate-limit to 500ms
 * between requests as a polite default — LimitlessTCG is a community resource.
 *
 * Environment variables:
 *   INSECURE_HTTPS=1: bypass SSL cert verification (needed on dev machines
 *                     with corporate proxies that inject self-signed certs)
 */
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

// Load .env.local (no dotenv dep — same pattern used across all scripts/)
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
  }
}

const BASE_URL = 'https://limitlesstcg.com';
const RATE_LIMIT_MS = 500;
const USER_AGENT = 'I.R.I.S Bootstrap/1.0 (https://github.com/personal-use; mono-user PWA)';
/** When true, fetch each card-detail page to extract illustrator. ~5x slower (one fetch per card). */
const SCRAPE_ILLUSTRATOR = process.env.SCRAPE_ILLUSTRATOR === '1';
/**
 * When true, ignore the resume-by-illustrator check and re-fetch every set
 * even if already populated. Default false — re-runs are idempotent and skip
 * completed sets, so a crashed scrape can be resumed by just re-running the
 * same command.
 */
const FORCE_RESCRAPE = process.env.FORCE_RESCRAPE === '1';

const MODE = process.env.MODE ?? 'probe';
const PROBE_SET = process.env.SET ?? 'SV11W';
const PROBE_LANG = process.env.PROBE_LANG ?? 'jp';

const INSECURE_HTTPS = process.env.INSECURE_HTTPS === '1';
if (INSECURE_HTTPS) {
  console.warn('⚠️  INSECURE_HTTPS=1 set — bypassing SSL certificate verification.');
}

async function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// ---------------------------------------------------------------------------
// Mappings — LimitlessTCG vocabulary → our enums
// ---------------------------------------------------------------------------

/** LimitlessTCG path codes → our card_language enum.
 *
 * NOTE: DE/IT/ES/PT are intentionally excluded — user only collects JP/EN/FR
 * (and KO/ZH which LimitlessTCG doesn't have anyway). Keeping them would add
 * ~58k rows of dead weight to the catalog. To re-enable, just add the entry. */
const LANG_MAP: Record<string, string> = {
  jp: 'JP',
  en: 'EN',
  fr: 'FR',
  // ko / zh not catalogued on LimitlessTCG (verified — both 404)
  // de / it / es / pt — disabled per user (unused in their collection)
};

/** LimitlessTCG rarity strings → our card_rarity enum.
 * Built from observed values + best-effort guesses for vintage / promo terms.
 * Anything not in this map falls through to OTHER and is logged at end of run. */
const RARITY_MAP: Record<string, string> = {
  // Modern (SV-era observed)
  'Common': 'C',
  'Uncommon': 'UC',
  'Rare': 'R',
  'Double Rare': 'RR',
  'Triple Rare': 'RR',
  'Ultra Rare': 'SR',
  'Art Rare': 'AR',
  'Special Art Rare': 'SAR',
  'Secret Rare': 'SAR',
  'Hyper Rare': 'SAR',
  // Older eras
  'Rare Holo': 'R_HOLO',
  'Holo Rare': 'R_HOLO',
  'Radiant Rare': 'RR',
  'Amazing Rare': 'SR',
  'Rainbow Rare': 'SAR',
  'Trainer Gallery Rare Holo': 'CHR',
  'Trainer Gallery Holo Rare': 'CHR',
  'Character Rare': 'CHR',
  'Character Holo Rare': 'CHR',
  'Character Super Rare': 'CHR',
  // Promo / one-offs
  'Promo': 'OTHER',
  'Black Star Promo': 'OTHER',
  'Shiny Rare': 'SR',
  'Shiny Ultra Rare': 'SAR',
  // Trainer/Energy categories — LimitlessTCG met le type de carte dans la
  // colonne "rareté" pour les non-Pokémon. Pas de tier — toutes en OTHER.
  'Item': 'OTHER',
  'Supporter': 'OTHER',
  'Tool': 'OTHER',
  'Stadium': 'OTHER',
  'Basic Energy': 'OTHER',
  'Special Energy': 'OTHER',
};

export function mapLanguage(limitlessLang: string): string | null {
  return LANG_MAP[limitlessLang] ?? null;
}

export function mapRarity(limitlessRarity: string | null): string {
  if (!limitlessRarity) return 'OTHER';
  return RARITY_MAP[limitlessRarity] ?? 'OTHER';
}

/**
 * Parse the per-language set index page (e.g. /cards/jp) and return all
 * set codes found. The set list page contains <a href="/cards/{lang}/{SET}">
 * anchors for each set in that language.
 */
export function parseSetIndex(html: string, language: string): string[] {
  const re = new RegExp(`href="/cards/${language}/([A-Za-z0-9.\\-]+)"`, 'g');
  const codes = new Set<string>();
  for (const match of html.matchAll(re)) {
    codes.add(match[1]);
  }
  return [...codes].sort();
}

/** Fetch + parse the set index for a given language. */
export async function fetchSetIndex(language: string): Promise<string[]> {
  const url = `${BASE_URL}/cards/${language}`;
  const res = await httpRequest(url, 'GET');
  if (res.status !== 200) {
    throw new Error(`Set index ${url} returned HTTP ${res.status}`);
  }
  return parseSetIndex(res.body, language);
}

/** Parsed card row from a set listing page. */
interface ScrapedCard {
  setCode: string;
  setName: string;
  setNumber: string;
  cardName: string;
  rarity: string | null;
  imageUrl: string;
  language: string;
  /** Populated by a follow-up card-detail fetch when SCRAPE_ILLUSTRATOR=1. */
  illustrator?: string | null;
}

/**
 * Extract illustrator from a single LimitlessTCG card-detail page.
 * Pattern observed: `Illustrated by\n<a href="/cards?q=!artist:NAME">NAME</a>`.
 * Returns null when the line is absent (some old / Trainer cards).
 */
export function parseIllustrator(html: string): string | null {
  const m = html.match(/Illustrated by\s*<a\s+href="\/cards\?q=!artist:[^"]+"\s*>\s*([^<]+?)\s*<\/a>/i);
  return m ? m[1].trim() : null;
}

/**
 * Parse a single set listing page. The HTML structure is stable enough that
 * targeted regexes are reliable (and avoid pulling in cheerio for one site).
 *
 * Each row matches /<tr data-hover="(image-url)">…</tr>/. Inside the row we
 * pick out: the data-tooltip on .card-set (set name), the first two
 * <a href="/cards/…/N"> anchors (number + card name), and the rarity text
 * in the second .md-only <td>.
 */
function parseSetPage(html: string, setCode: string, language: string): ScrapedCard[] {
  const cards: ScrapedCard[] = [];

  // Set name appears once per row in data-tooltip — pull it from the first row.
  let setName = setCode;
  const setNameMatch = html.match(/data-tooltip="([^"]+)"[^>]*>[^<]*<img[^>]+alt="[^"]+"[^>]*>[A-Za-z0-9]+<\/span>/);
  if (setNameMatch) setName = setNameMatch[1];

  // Iterate <tr data-hover="..."> rows.
  const rowRegex = /<tr\s+data-hover="([^"]+)">([\s\S]*?)<\/tr>/g;
  for (const rowMatch of html.matchAll(rowRegex)) {
    const imageUrlXs = rowMatch[1];
    const rowHtml = rowMatch[2];

    // Number + card name are the first two link anchors of the form
    // <a href="/cards/{lang}/{SET}/{N}">{TEXT}</a>.
    const linkRe = /<a\s+href="\/cards\/[a-z]+\/[A-Za-z0-9]+\/(\d+)"[^>]*>([^<]+)<\/a>/g;
    const links = [...rowHtml.matchAll(linkRe)];
    if (links.length < 2) continue;
    const setNumber = links[0][1].trim();
    const cardName = links[1][2].trim();

    // Rarity sits in the LAST visible md-only <td> (the one with just text).
    // Form: <td class="md-only"><a href="/cards/.../N"> Common </a></td>
    let rarity: string | null = null;
    const rarityMatches = [...rowHtml.matchAll(
      /<td\s+class="md-only">\s*<a[^>]*>\s*([A-Za-z][A-Za-z\s]*?)\s*<\/a>\s*<\/td>/g,
    )];
    if (rarityMatches.length > 0) {
      // First text-only td is rarity; second has type+stage. Take the last
      // matching one — empirically the rarity is the second td.md-only.
      rarity = rarityMatches[rarityMatches.length - 1][1].trim();
    }

    // Upgrade XS image to LG (large). The CDN serves multiple sizes.
    const imageUrl = imageUrlXs.replace(/_XS\.png$/, '_LG.png');

    cards.push({ setCode, setName, setNumber, cardName, rarity, imageUrl, language });
  }
  return cards;
}

/**
 * Generic HTTP request helper using https.get. Handles both GET and HEAD
 * requests, and respects INSECURE_HTTPS env var for SSL cert verification.
 */
async function httpRequest(
  url: string,
  method: 'GET' | 'HEAD' = 'GET',
): Promise<{ status: number; contentType: string; body: string }> {
  return new Promise((resolve, reject) => {
    https.get(url, {
      method,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      ...(INSECURE_HTTPS ? { rejectUnauthorized: false } : {}),
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode ?? 0,
        contentType: res.headers['content-type'] ?? '',
        body: Buffer.concat(chunks).toString('utf-8'),
      }));
    }).on('error', (err) => {
      reject(new Error(`Failed to ${method} ${url}: ${err.message}`));
    });
  });
}

async function fetchSetPage(setCode: string, language: string): Promise<string> {
  const url = `${BASE_URL}/cards/${language}/${encodeURIComponent(setCode)}?display=list`;
  const res = await httpRequest(url, 'GET');

  if (res.status !== 200) {
    throw new Error(`LimitlessTCG ${res.status} ${url}`);
  }

  return res.body;
}

/**
 * Fetch illustrator for every card in a set, with bounded concurrency.
 * One HTTP call per card — expensive (~52k requests for full JP/EN/FR scrape)
 * so we parallelize at CARD_FETCH_CONCURRENCY (5 by default, polite enough
 * for LimitlessTCG without an explicit rate limit).
 */
const CARD_FETCH_CONCURRENCY = 5;

async function enrichWithIllustrators(cards: ScrapedCard[]): Promise<void> {
  let cursor = 0;
  async function worker() {
    while (cursor < cards.length) {
      const i = cursor++;
      const c = cards[i];
      const url = `${BASE_URL}/cards/${c.language}/${encodeURIComponent(c.setCode)}/${c.setNumber}`;
      try {
        const res = await httpRequest(url, 'GET');
        if (res.status === 200) {
          c.illustrator = parseIllustrator(res.body);
        } else {
          c.illustrator = null;
        }
      } catch {
        c.illustrator = null;
      }
    }
  }
  await Promise.all(Array.from({ length: CARD_FETCH_CONCURRENCY }, () => worker()));
}

async function probe() {
  console.log(`Probing ${BASE_URL}/cards/${PROBE_LANG}/${PROBE_SET}?display=list`);
  const html = await fetchSetPage(PROBE_SET, PROBE_LANG);
  console.log(`Fetched ${html.length} bytes.`);

  const cards = parseSetPage(html, PROBE_SET, PROBE_LANG);
  console.log(`Parsed ${cards.length} cards.\n`);

  if (cards.length === 0) {
    console.error('NO CARDS PARSED — check HTML structure assumptions.');
    process.exit(1);
  }

  // I-1: Warn if set name extraction fell back to setCode
  if (cards.length > 0 && cards[0].setName === PROBE_SET) {
    console.warn(
      `WARNING: setName extraction fell back to setCode "${PROBE_SET}". ` +
      `The data-tooltip regex may need updating — check page source.`,
    );
  }

  // Print first 5 + last 2
  const preview = [...cards.slice(0, 5), ...(cards.length > 7 ? cards.slice(-2) : [])];
  for (const c of preview) {
    console.log(JSON.stringify(c, null, 2));
  }

  // Stats
  console.log(`\n=== Stats for ${PROBE_SET}/${PROBE_LANG} ===`);
  console.log(`Total cards: ${cards.length}`);
  console.log(`Set name: "${cards[0].setName}"`);
  const raritySet = new Set(cards.map((c) => c.rarity));
  console.log(`Rarities found: ${[...raritySet].sort().join(', ')}`);
  const cardsWithoutImage = cards.filter((c) => !c.imageUrl).length;
  console.log(`Cards missing image_url: ${cardsWithoutImage}`);
  const cardsWithoutName = cards.filter((c) => !c.cardName).length;
  console.log(`Cards missing card_name: ${cardsWithoutName}`);

  // Verify one image URL works
  const firstImageUrl = cards[0].imageUrl;
  console.log(`\nVerifying first image URL: ${firstImageUrl}`);
  await sleep(RATE_LIMIT_MS);
  const imgRes = await httpRequest(firstImageUrl, 'HEAD');
  console.log(`  HTTP ${imgRes.status} ${imgRes.contentType}`);

  console.log(`\n=== Set index for /cards/${PROBE_LANG} ===`);
  await sleep(RATE_LIMIT_MS);
  const allSets = await fetchSetIndex(PROBE_LANG);
  console.log(`Total sets in /cards/${PROBE_LANG}: ${allSets.length}`);
  console.log(`First 5: ${allSets.slice(0, 5).join(', ')}`);
  console.log(`Last 5: ${allSets.slice(-5).join(', ')}`);

  // Stat: how many of this set's cards have a rarity that maps to OTHER?
  const unmappedRarities = new Set<string>();
  for (const c of cards) {
    if (c.rarity && !RARITY_MAP[c.rarity]) unmappedRarities.add(c.rarity);
  }
  if (unmappedRarities.size > 0) {
    console.log(`\nUnmapped rarities in ${PROBE_SET} (would default to OTHER):`);
    for (const r of unmappedRarities) console.log(`  - "${r}"`);
  }
}

/** Strip card name suffixes (ex/V/VMAX/etc) to recover the bare species name.
 * Mirrors the implementation in lib/api/tcgdex.ts. */
function extractPokemonName(cardName: string): string {
  return cardName
    .replace(/[-\s]*(ex|EX|GX|V|VMAX|VSTAR|V-?UNION|BREAK|LEGEND)\s*$/i, '')
    .trim();
}

async function full() {
  // Dynamic import of Supabase — circumvents 'server-only' pkg restriction
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Languages to crawl. Driven by the LANG_MAP keys (already validated to
  // exist on LimitlessTCG). Default crawls all 7; can be narrowed via
  // LANGUAGES=jp,en env var.
  const allLangs = Object.keys(LANG_MAP);
  const langsEnv = process.env.LANGUAGES;
  const languages = langsEnv ? langsEnv.split(',').map((s) => s.trim()).filter(Boolean) : allLangs;

  // Optional ONLY_SETS env var to test on a subset (comma-separated set codes).
  const onlySetsEnv = process.env.ONLY_SETS;
  const onlySets = onlySetsEnv ? new Set(onlySetsEnv.split(',').map((s) => s.trim())) : null;

  console.log(`Starting full crawl of LimitlessTCG.`);
  console.log(`Languages: ${languages.join(', ')}${onlySets ? ` (filtered to sets: ${[...onlySets].join(',')})` : ''}`);
  console.log(`Rate limit: ${RATE_LIMIT_MS}ms between requests.\n`);

  const stats = {
    setsAttempted: 0,
    setsSucceeded: 0,
    setsFailed: 0,
    cardsUpserted: 0,
    upsertErrors: 0,
  };
  const unmappedRarities = new Set<string>();
  const failedSets: { lang: string; set: string; error: string }[] = [];

  for (const lang of languages) {
    const ourLang = mapLanguage(lang);
    if (!ourLang) {
      console.log(`SKIP language "${lang}" — no mapping to our enum.`);
      continue;
    }

    console.log(`\n=== Language: ${lang} (→ ${ourLang}) ===`);
    let setCodes: string[];
    try {
      await sleep(RATE_LIMIT_MS);
      setCodes = await fetchSetIndex(lang);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Failed to fetch set index for ${lang}: ${msg}`);
      continue;
    }
    if (onlySets) setCodes = setCodes.filter((s) => onlySets.has(s));
    console.log(`Found ${setCodes.length} sets to crawl.`);

    for (let i = 0; i < setCodes.length; i++) {
      const setCode = setCodes[i];
      const tag = `[${i + 1}/${setCodes.length}] ${lang}/${setCode}`;
      stats.setsAttempted++;

      // Resume support: when SCRAPE_ILLUSTRATOR is on, skip sets where every
      // existing row already has illustrator populated. If ANY row is missing
      // it (mid-batch crash, new set published since last run), redo. Override
      // with FORCE_RESCRAPE=1 to redo everything regardless.
      // DB-driven, survives crashes / Ctrl-C / re-runs without state files.
      if (SCRAPE_ILLUSTRATOR && !FORCE_RESCRAPE) {
        const [{ count: total }, { count: missing }] = await Promise.all([
          supabase.from('tcg_catalog').select('*', { head: true, count: 'exact' })
            .eq('language', ourLang).eq('set_code', setCode),
          supabase.from('tcg_catalog').select('*', { head: true, count: 'exact' })
            .eq('language', ourLang).eq('set_code', setCode)
            .is('illustrator', null),
        ]);
        if ((total ?? 0) > 0 && (missing ?? 0) === 0) {
          console.log(`${tag} — SKIP (${total} cards, all have illustrators)`);
          stats.setsSucceeded++;
          continue;
        }
      }

      try {
        await sleep(RATE_LIMIT_MS);
        const url = `${BASE_URL}/cards/${lang}/${encodeURIComponent(setCode)}?display=list`;
        const res = await httpRequest(url, 'GET');
        if (res.status !== 200) {
          throw new Error(`HTTP ${res.status}`);
        }
        const cards = parseSetPage(res.body, setCode, lang);
        if (cards.length === 0) {
          console.log(`${tag} — 0 cards parsed (set may be empty/index-only)`);
          stats.setsSucceeded++;
          continue;
        }

        // Optional: fetch each card-detail page to extract illustrator. Costly
        // (1 HTTP per card, parallelized at concurrency 5) but worth it once for
        // disambiguation in /api/enrich Strategy 2.5. Toggle via env var.
        if (SCRAPE_ILLUSTRATOR) {
          await enrichWithIllustrators(cards);
        }

        // Build catalog rows (denormalize set_total = count of cards in this set)
        const setTotal = cards.length;
        const rows = cards.map((c) => {
          if (c.rarity && !RARITY_MAP[c.rarity]) unmappedRarities.add(c.rarity);
          return {
            cardmarket_id: '',  // empty for LimitlessTCG-sourced rows; future: backfill
            set_code: c.setCode,
            set_number: c.setNumber,
            set_total: setTotal,
            language: ourLang,
            card_name: c.cardName,
            pokemon_name: extractPokemonName(c.cardName),
            pokemon_number: null,  // not exposed by LimitlessTCG list view
            set_name: c.setName,
            rarity: mapRarity(c.rarity),
            image_url: c.imageUrl,
            illustrator: c.illustrator ?? null,
          };
        });

        // Upsert in batches of 100
        for (let j = 0; j < rows.length; j += 100) {
          const batch = rows.slice(j, j + 100);
          const { error } = await supabase
            .from('tcg_catalog')
            .upsert(batch, { onConflict: 'set_code,set_number,language' });
          if (error) {
            console.error(`${tag} batch ${j}-${j + batch.length} failed: ${error.message}`);
            stats.upsertErrors++;
          } else {
            stats.cardsUpserted += batch.length;
          }
        }
        console.log(`${tag} — ${rows.length} cards upserted (running total: ${stats.cardsUpserted})`);
        stats.setsSucceeded++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`${tag} FAILED: ${msg}`);
        failedSets.push({ lang, set: setCode, error: msg });
        stats.setsFailed++;
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Crawl complete:`);
  console.log(`  Sets attempted:  ${stats.setsAttempted}`);
  console.log(`  Sets succeeded:  ${stats.setsSucceeded}`);
  console.log(`  Sets failed:     ${stats.setsFailed}`);
  console.log(`  Cards upserted:  ${stats.cardsUpserted}`);
  console.log(`  Upsert errors:   ${stats.upsertErrors}`);
  if (failedSets.length > 0) {
    console.log(`\nFailed sets (review and re-run if needed):`);
    for (const f of failedSets) console.log(`  ${f.lang}/${f.set}: ${f.error}`);
  }
  if (unmappedRarities.size > 0) {
    console.log(`\nUnmapped rarities (added to RARITY_MAP after this run):`);
    for (const r of unmappedRarities) console.log(`  - "${r}"`);
  }
}

const action = MODE === 'full' ? full : probe;
action().catch((e) => {
  console.error('Scrape failed:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
