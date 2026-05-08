// scripts/scrape-cardmarket-cards.ts
//
// Per-expansion scrape of the Cardmarket gallery view. For each card on the
// listing page extracts:
//   - idProduct    (from the image URL: /51/{set}/{idProduct}/{idProduct}.jpg)
//   - set_number   (from the URL slug suffix, e.g. "sv5a052" → 52)
//   - url_variant  ('V1', 'V2', ... or null — distinguishes prints sharing
//                  the same set_number, e.g. Common vs Reverse Holo vs AR)
//
// Walks all pages via the ?site=N URL param. Upserts into Supabase
// `cardmarket_card_index`.
//
// Resume: skips expansions that already have rows in the index. If a previous
// run crashed mid-expansion, the partial rows persist; pass --force to
// re-scrape an expansion regardless.
//
// Rate-limit posture: Cardmarket sits behind Cloudflare which issues a 1015
// IP ban (24-72h) after sustained scraping. Previous run at 2.5s/page + 5s/exp
// got the dev IP banned. Current pacing: ~8s/page + ~30s/exp, kill-switch at
// 2 cumulative 429s — Cloudflare memorises fast, abort early to avoid extending
// the ban.
//
// Usage:
//   npm run scrape-cardmarket -- Crimson-Haze Mascarade-Crepusculaire
//   npm run scrape-cardmarket -- --modern              # ~280 modern sets (SV+, ~6h)
//   npm run scrape-cardmarket -- --all                 # all 741 expansions (~16h)
//   npm run scrape-cardmarket -- --since 5500          # since idExpansion 5500
//   npm run scrape-cardmarket -- --force --modern      # re-scrape everything
//   npm run scrape-cardmarket -- --dry-run Crimson-Haze
//
// Env required:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(__dirname, '..', '.env.local') });
dotenvConfig();

import { readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { createClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

const ROOT = path.resolve(__dirname, '..');
const MODERN_FILE = path.join(ROOT, 'scripts', 'data', 'cardmarket-modern-expansions.json');
const BASE_URL = 'https://www.cardmarket.com/fr/Pokemon/Products/Singles';
const PAGE_TIMEOUT = 30_000;
const INTER_PAGE_DELAY_MS = 8_000;       // jittered ±2s
const INTER_EXPANSION_DELAY_MS = 30_000; // jittered ±10s
const PAGE_429_COOLDOWN_MS = 60_000;     // base, multiplied by retry attempt
const PAGE_MAX_RETRIES = 3;
const KILL_SWITCH_429_THRESHOLD = 2;
const LOCALE = 'fr';
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
function jitter(baseMs: number, spreadMs: number): number {
  return baseMs + Math.random() * spreadMs;
}

interface ModernEntry { name: string; slug: string }

function service(): AnyClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

interface ScrapedCard {
  idProduct: number;
  setNumber: string;
  urlVariant: string | null;
  /** Cardmarket URL path (without scheme/host), e.g. "/fr/Pokemon/Products/Singles/...". */
  urlPath: string;
  /** Free-form name pulled from the gallery card title — used for diagnostics. */
  name: string;
}

interface ScrapedExpansion {
  idExpansion: number;
  slug: string;
  name: string;
  cards: ScrapedCard[];
}

/**
 * Parse one rendered listing-page DOM into a list of cards. Runs INSIDE the
 * browser context (Playwright serializes it), so it can use plain DOM APIs.
 */
function extractCardsFromPage(): ScrapedCard[] {
  const cards: ScrapedCard[] = [];
  const links = document.querySelectorAll<HTMLAnchorElement>('a.galleryBox[href*="/Pokemon/Products/Singles/"]');
  for (const a of Array.from(links)) {
    const href = a.getAttribute('href') ?? '';
    // href format: /fr/Pokemon/Products/Singles/{set-slug}/{Card-Name}-(V?N-)?{setcode}{number}
    // Regex: trailing "{letters_lowercase_optionally_digits}{digits}" preceded by an optional "-V{N}-" hint.
    // We'll extract the LAST segment after the last "/" then peel off the trailing "{letters}{digits}".
    const last = href.split('/').pop() ?? '';
    // Extract trailing setcode+number = lowercase-letters + digits at the end of slug.
    const trail = last.match(/-([a-z]+\d+[a-z]?)?(\d+)$/i) ?? last.match(/([a-z]+\d*[a-z]?)(\d+)$/i);
    let setNumber: string | null = null;
    if (trail) {
      // The very last digit-group is the set_number (zero-padded). Strip leading zeros.
      const numRaw = trail[trail.length - 1];
      setNumber = String(parseInt(numRaw, 10));
    }

    // url_variant: -V1- / -V2- / etc. between name and setcode
    const variantMatch = last.match(/-V(\d+)-/i);
    const urlVariant = variantMatch ? `V${variantMatch[1]}` : null;

    // idProduct from image data-echo attribute on the inner <img>:
    //   https://product-images.s3.cardmarket.com/51/sv5a/761512/761512.jpg
    const img = a.querySelector('img');
    const dataEcho = img?.getAttribute('data-echo') ?? img?.getAttribute('src') ?? '';
    const idMatch = dataEcho.match(/\/(\d+)\/\d+\.(jpg|webp|png)/i);
    const idProduct = idMatch ? Number(idMatch[1]) : null;

    // Display name from <h2> or img alt
    const h2 = a.querySelector('h2');
    const titleText = h2?.textContent?.trim() ?? img?.getAttribute('alt') ?? '';
    const name = titleText.replace(/\s+/g, ' ').trim();

    if (idProduct && setNumber) {
      cards.push({ idProduct, setNumber, urlVariant, urlPath: href, name });
    }
  }
  return cards;
}

/**
 * Read the "Page X sur Y" text from the pagination block. Returns total page
 * count, defaulting to 1 if absent (small expansions).
 */
function extractTotalPagesFromPage(): number {
  const match = document.body.innerText.match(/Page\s+(\d+)\s+sur\s+(\d+)/i);
  return match ? parseInt(match[2], 10) : 1;
}

async function scrapeOneExpansion(
  page: Page,
  slug: string,
): Promise<{ cards: ScrapedCard[]; totalPages: number; blocked: number }> {
  const allCards: ScrapedCard[] = [];
  let totalPages = 1;
  let blockedTotal = 0;

  for (let site = 1; site <= totalPages; site += 1) {
    const url = `${BASE_URL}/${slug}?idRarity=0${site > 1 ? `&site=${site}` : ''}`;

    let attempts = 0;
    while (attempts <= PAGE_MAX_RETRIES) {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
      const status = resp?.status() ?? 0;

      if (status === 429) {
        attempts++;
        blockedTotal++;
        if (attempts > PAGE_MAX_RETRIES) {
          throw new Error(`HTTP 429 on ${url} after ${PAGE_MAX_RETRIES} retries`);
        }
        const cooldown = PAGE_429_COOLDOWN_MS * attempts;
        console.log(
          `\n    429 on page ${site} — retry ${attempts}/${PAGE_MAX_RETRIES}, cooling ${Math.round(cooldown / 1000)}s`,
        );
        await sleep(cooldown);
        continue;
      }

      if (status !== 200) {
        throw new Error(`HTTP ${status} on ${url}`);
      }
      break;
    }

    await page.waitForSelector('a.galleryBox', { timeout: 10_000 }).catch(() => {
      throw new Error(`No galleryBox found on ${url} — wrong slug or empty expansion?`);
    });

    if (site === 1) {
      totalPages = await page.evaluate(extractTotalPagesFromPage);
    }
    const pageCards = await page.evaluate(extractCardsFromPage);
    allCards.push(...pageCards);
    process.stdout.write(`\r    page ${site}/${totalPages} → +${pageCards.length} (total ${allCards.length})`);

    if (site < totalPages) {
      await sleep(jitter(INTER_PAGE_DELAY_MS, 2_000));
    }
  }
  process.stdout.write('\n');
  return { cards: allCards, totalPages, blocked: blockedTotal };
}

/**
 * Returns the subset of given idProducts that exist in cardmarket_products.
 * Chunked to stay under PostgREST URL length limits on big expansions.
 */
async function filterToKnownProductIds(
  supabase: AnyClient,
  idProducts: number[],
): Promise<Set<number>> {
  const known = new Set<number>();
  const CHUNK = 500;
  for (let i = 0; i < idProducts.length; i += CHUNK) {
    const slice = idProducts.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('cardmarket_products')
      .select('id_product')
      .in('id_product', slice);
    if (error) throw new Error(`filterToKnownProductIds: ${error.message}`);
    for (const r of (data ?? []) as { id_product: number }[]) known.add(r.id_product);
  }
  return known;
}

async function upsertExpansion(supabase: AnyClient, exp: ScrapedExpansion): Promise<void> {
  if (exp.cards.length === 0) return;

  // Drop scraped cards whose id_product isn't in cardmarket_products yet — the
  // gallery is updated in near-real-time, but the official JSON dumps lag by
  // ~a week. Without this filter the whole expansion's atomic upsert FK-fails
  // and zero rows persist (so resume re-scrapes the same expansion forever).
  const known = await filterToKnownProductIds(
    supabase,
    exp.cards.map((c) => c.idProduct),
  );
  const valid = exp.cards.filter((c) => known.has(c.idProduct));
  const dropped = exp.cards.length - valid.length;
  if (dropped > 0) {
    console.log(
      `    dropped ${dropped}/${exp.cards.length} orphan id_product(s) — not in cardmarket_products dump yet`,
    );
  }
  if (valid.length === 0) return;

  const rows = valid.map((c) => ({
    id_product: c.idProduct,
    id_expansion: exp.idExpansion,
    set_number: c.setNumber,
    url_variant: c.urlVariant,
    url_path: c.urlPath,
    language: LOCALE,
    scraped_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('cardmarket_card_index').upsert(rows, { onConflict: 'id_product' });
  if (error) throw new Error(`upsert id_expansion=${exp.idExpansion}: ${error.message}`);
}

/**
 * Returns the set of id_expansion values that already have at least one row
 * in cardmarket_card_index. Used to skip expansions on resume.
 */
async function fetchScrapedExpansions(supabase: AnyClient): Promise<Set<number>> {
  const { data, error } = await supabase
    .from('cardmarket_card_index')
    .select('id_expansion');
  if (error) throw new Error(`fetchScrapedExpansions: ${error.message}`);
  return new Set((data ?? []).map((r: { id_expansion: number }) => r.id_expansion));
}

interface ResolvedTarget { idExpansion: number; slug: string; name: string }

/**
 * Derive a Cardmarket URL slug from an expansion display name. Verified to
 * reproduce 281/281 entries of the committed modern list. Rules:
 *   - NFD normalize, strip combining marks (accents → ASCII)
 *   - Drop apostrophes (' and ')
 *   - Drop ampersands (Cardmarket omits them, doesn't replace with "and")
 *   - Strip everything else that's not a-z, 0-9, space, dash, or colon
 *   - Collapse whitespace, replace each space with a dash
 */
function nameToSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/&/g, '')
    .replace(/[^a-zA-Z0-9 \-:]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ /g, '-');
}

async function fetchAllExpansions(supabase: AnyClient): Promise<ResolvedTarget[]> {
  const { data, error } = await supabase
    .from('cardmarket_expansions')
    .select('id_expansion, name')
    .order('id_expansion', { ascending: false });
  if (error) throw new Error(`fetchAllExpansions: ${error.message}`);
  return (data ?? []).map((r: { id_expansion: number; name: string }) => ({
    idExpansion: r.id_expansion,
    name: r.name,
    slug: nameToSlug(r.name),
  }));
}

async function resolveTargets(supabase: AnyClient | null): Promise<ResolvedTarget[]> {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const useAll = process.argv.includes('--all');
  const useModern = process.argv.includes('--modern');
  const sinceArg = process.argv.find((a) => a.startsWith('--since='));
  const sinceId = sinceArg ? Number(sinceArg.slice('--since='.length)) : null;

  if (useAll) {
    if (!supabase) throw new Error('--all requires Supabase access (no --dry-run)');
    return fetchAllExpansions(supabase);
  }

  const modernMap = JSON.parse(readFileSync(MODERN_FILE, 'utf-8')) as Record<string, ModernEntry>;

  if (useModern) {
    return Object.entries(modernMap).map(([id, e]) => ({
      idExpansion: Number(id),
      slug: e.slug,
      name: e.name,
    }));
  }
  if (sinceId != null) {
    return Object.entries(modernMap)
      .filter(([id]) => Number(id) >= sinceId)
      .map(([id, e]) => ({ idExpansion: Number(id), slug: e.slug, name: e.name }));
  }
  if (args.length > 0) {
    const slugToId = new Map(Object.entries(modernMap).map(([id, e]) => [e.slug, { id: Number(id), name: e.name }]));
    const resolved: ResolvedTarget[] = [];
    const unknownSlugs: string[] = [];
    for (const slug of args) {
      const found = slugToId.get(slug);
      if (found) {
        resolved.push({ idExpansion: found.id, slug, name: found.name });
      } else {
        unknownSlugs.push(slug);
      }
    }
    // Fallback: resolve unknown slugs from DB (older expansions not in modern list).
    if (unknownSlugs.length > 0) {
      if (!supabase) throw new Error(`Unknown slugs ${unknownSlugs.join(', ')} require Supabase access`);
      const all = await fetchAllExpansions(supabase);
      const slugMap = new Map(all.map((t) => [t.slug, t]));
      for (const slug of unknownSlugs) {
        const t = slugMap.get(slug);
        if (!t) throw new Error(`Unknown slug "${slug}" — not in modern JSON nor in cardmarket_expansions`);
        resolved.push(t);
      }
    }
    return resolved;
  }
  throw new Error('No targets. Pass slugs as args, or --modern, --all, or --since=NNNN');
}

async function main(): Promise<void> {
  const supabase = DRY_RUN ? null : service();
  const allTargets = await resolveTargets(supabase);

  // Resume: drop targets that already have rows in card_index (unless --force).
  let targets = allTargets;
  if (supabase && !FORCE) {
    const done = await fetchScrapedExpansions(supabase);
    const before = targets.length;
    targets = targets.filter((t) => !done.has(t.idExpansion));
    const skipped = before - targets.length;
    if (skipped > 0) {
      console.log(`Resume: skipping ${skipped} already-scraped expansion(s) (use --force to re-scrape).`);
    }
  }

  if (targets.length === 0) {
    console.log('Nothing to scrape — all targets already in cardmarket_card_index.');
    return;
  }

  console.log(`Will scrape ${targets.length} expansion(s)${DRY_RUN ? ' [DRY RUN — no upsert]' : ''}`);

  const browser: Browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'fr-FR',
  });
  const page = await ctx.newPage();

  let totalCardsScraped = 0;
  let totalBlocked = 0;
  let abortAll = false;
  const failures: Array<{ slug: string; reason: string }> = [];

  /** Returns true when the cumulative 429 count crosses the kill switch. */
  function tripped(): boolean {
    if (totalBlocked < KILL_SWITCH_429_THRESHOLD) return false;
    console.log(`\nKILL SWITCH: ${totalBlocked} total 429s — aborting to avoid IP flag.`);
    return true;
  }

  for (let i = 0; i < targets.length; i += 1) {
    if (abortAll) break;
    const t = targets[i];
    console.log(`\n[${i + 1}/${targets.length}] ${t.idExpansion} — ${t.name} (${t.slug})`);
    try {
      const { cards, blocked } = await scrapeOneExpansion(page, t.slug);
      if (supabase) await upsertExpansion(supabase, { ...t, cards });
      totalCardsScraped += cards.length;
      totalBlocked += blocked;
      abortAll = tripped();
    } catch (err) {
      const reason = (err as Error).message;
      console.error(`  FAIL: ${reason}`);
      failures.push({ slug: t.slug, reason });

      if (reason.includes('429')) {
        totalBlocked++;
        if (tripped()) {
          abortAll = true;
        } else {
          console.log('    cooling 90s after gallery 429...');
          await sleep(90_000);
        }
      }
    }

    if (i < targets.length - 1 && !abortAll) {
      const delay = jitter(INTER_EXPANSION_DELAY_MS, 10_000);
      console.log(`    waiting ${Math.round(delay / 1000)}s before next expansion...`);
      await sleep(delay);
    }
  }

  await browser.close();

  console.log(`\nDone. ${totalCardsScraped} cards across ${targets.length - failures.length}/${targets.length} expansions.`);
  if (totalBlocked > 0) console.log(`  ${totalBlocked} total 429 responses.`);
  if (failures.length > 0) {
    console.log(`\n${failures.length} failed:`);
    for (const f of failures) console.log(`  - ${f.slug}: ${f.reason}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
