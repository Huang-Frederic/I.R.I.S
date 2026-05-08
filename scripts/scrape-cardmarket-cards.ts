// scripts/scrape-cardmarket-cards.ts
//
// FALLBACK SCRAPER — read this first.
//
// `cardmarket_card_index` is normally populated by a deterministic SQL formula
// derived from the daily Cardmarket dump (id_product order + card_prefix
// grouping → set_number + url_variant). The formula covers ~95%+ of all
// expansions in seconds, with no Cloudflare risk. See the full discovery,
// validation results, and the ready-to-run query in:
//
//     docs/cardmarket-mapping.md
//
// This Playwright scraper is kept as the fallback for the cases the formula
// can't handle:
//   - Wheel-type promo sets (Battle Party Set, Void Blast — collector range
//     0-9 with non-deterministic ordering)
//   - Rare cases where you need the actual `url_path` deep link populated
//     (the formula leaves it NULL since the URL slug isn't derivable from
//     the dump)
//   - Future-proofing if Cardmarket changes their id_product allocation
//     pattern and breaks the formula's assumptions
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
// Anti-bot posture: Cardmarket sits behind Cloudflare with two layers:
//   1. Bot Fight Mode (403 on fingerprint mismatch) — mitigated via
//      rebrowser-playwright (drop-in for playwright that patches CDP-level
//      tells like Runtime.Enable that the puppeteer-extra stealth plugin
//      can't reach) plus channel: 'chrome' (system Chrome, matching TLS
//      handshake + client hints exactly), and a UA aligned with the host
//      OS so navigator.platform doesn't contradict the UA string.
//   2. Rate-limit → 1015 IP ban (24-72h) after sustained scraping. Previous
//      runs at 2.5s/page and 8s/page both got flagged after ~9 page loads.
//      Current pacing: ~15s/page + ~60s/exp + 3-5min cooldown every 25
//      successful expansions (drains the sliding window before it crosses
//      Cloudflare's threshold). Kill switch at 2 cumulative 429s — abort
//      early so we don't extend the ban via continued requests.
//
// Pre-flight: hits the Pokemon homepage once before iterating expansions.
// 403 here = IP/fingerprint already flagged → bail BEFORE burning the IP
// further on a doomed run.
//
// Diagnostics: every 403 (BAD_SLUG or real) dumps cf-ray, cf-cache-status,
// and a screenshot to scripts/data/403-{ts}.png. Cf-ray maps 1:1 to a
// Cloudflare firewall log entry — keep it for cross-reference if you ever
// get access to their logs (or to share with their support).
//
// If you got flagged (403 mid-scrape, 1015 page in browser, or BAD_SLUG on a
// trusted slug like one in cardmarket-modern-expansions.json):
//   1. STOP all scraper runs immediately. Each retry while flagged extends
//      the cooldown — Cloudflare resets the timer on continued abuse.
//   2. Verify in a normal browser (not the scraper) — load any Cardmarket
//      Pokemon URL. 1015/challenge → IP-banned, wait. 200 → fingerprint flag,
//      not IP, but still wait before retrying via the scraper.
//   3. Wait minimum 4-6h, ideally overnight. 10-30min is NEVER enough,
//      Cloudflare's sliding window is 1h+ and escalation flags last longer.
//   4. If you must scrape sooner, switch IPs (mobile hotspot on the scraping
//      machine) — does NOT reset fingerprint flags but bypasses IP bans.
//   5. Resume picks up automatically via cardmarket_card_index — no manual
//      progress tracking needed.
//
// Usage:
//   npm run scrape-cardmarket -- Battle-Party-Set      # one wheel-type promo
//   npm run scrape-cardmarket -- Crimson-Haze          # one specific expansion
//   npm run scrape-cardmarket -- --modern              # ~280 modern sets — RARELY needed; SQL formula already covers them
//   npm run scrape-cardmarket -- --all                 # all 741 expansions — DO NOT RUN; SQL formula does it in seconds
//
// Env optional:
//   BROWSER_CHANNEL=chromium  # use bundled Chromium instead of system Chrome
//                             # (e.g. WSL without google-chrome-stable)
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

import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { chromium, type Browser, type Page, type Response as PWResponse } from 'rebrowser-playwright';
import { createClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

const ROOT = path.resolve(__dirname, '..');
const MODERN_FILE = path.join(ROOT, 'scripts', 'data', 'cardmarket-modern-expansions.json');
const BASE_URL = 'https://www.cardmarket.com/fr/Pokemon/Products/Singles';
const PREFLIGHT_URL = 'https://www.cardmarket.com/fr/Pokemon';
const PAGE_TIMEOUT = 30_000;
const INTER_PAGE_DELAY_MS = 15_000;      // jittered +5s — slow enough to dodge Cloudflare's sliding-window rate
const INTER_EXPANSION_DELAY_MS = 60_000; // jittered +20s
const PAGE_429_COOLDOWN_MS = 60_000;     // base, multiplied by retry attempt
const PAGE_MAX_RETRIES = 3;
const KILL_SWITCH_429_THRESHOLD = 2;
const CONSECUTIVE_BAD_SLUG_THRESHOLD = 3;  // 3+ in a row = probably bot detection masquerading as bad slugs
const BATCH_SIZE = 25;                   // # of successful expansions between long cooldowns
const BATCH_COOLDOWN_MS = 180_000;       // base 3 min, jittered up to +2 min — drains the request-window counter
const BAD_SLUGS_FILE = path.join(__dirname, 'data', 'cardmarket-bad-slugs.json');
const DIAG_DIR = path.join(__dirname, 'data');
const LOCALE = 'fr';
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
function jitter(baseMs: number, spreadMs: number): number {
  return baseMs + Math.random() * spreadMs;
}

/**
 * Build a User-Agent string that matches the host platform — Cardmarket /
 * Cloudflare can cross-check `navigator.platform` against UA, and a Linux UA
 * on a Windows host (or vice versa) is a small but real bot signal.
 */
function realisticUA(): string {
  const platform = os.platform();
  if (platform === 'win32') {
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  }
  if (platform === 'linux') {
    return 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  }
  // darwin / other → mac
  return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
}

/**
 * On a 403, capture the Cloudflare diagnostic headers (cf-ray identifies the
 * exact firewall rule that fired, cf-cache-status tells if it was an edge
 * decision) and a screenshot of the response page. Saves to scripts/data/ so
 * later debug sessions can correlate "scrape died at HH:MM" with a specific
 * Cloudflare rule firing in their logs.
 */
async function dump403Diagnostics(page: Page, response: PWResponse, url: string): Promise<void> {
  try {
    const headers = response.headers();
    const cfRay = headers['cf-ray'] ?? 'none';
    const cfCache = headers['cf-cache-status'] ?? 'none';
    const server = headers['server'] ?? 'none';
    console.error(`    diagnostic: cf-ray=${cfRay} cf-cache=${cfCache} server=${server}`);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = path.join(DIAG_DIR, `403-${ts}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.error(`    screenshot: ${screenshotPath}`);
    console.error(`    url: ${url}`);
  } catch (err) {
    console.error(`    diagnostic capture failed: ${(err as Error).message}`);
  }
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
  trustedSlug: boolean,
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

      // Capture Cloudflare diagnostics on ANY 403 (BAD_SLUG or real bot
      // detection) before throwing — once thrown the page state is gone.
      if (status === 403 && resp) {
        await dump403Diagnostics(page, resp, url);
      }
      // 403 on page 1 with an UNTRUSTED slug = probably Cardmarket's
      // "extension invalide" page (the slug derivation got it wrong). Skip
      // and log for manual fixup. With a TRUSTED slug (curated in modern
      // JSON or user-supplied), 403 is real bot detection — fall through to
      // the generic HTTP 403 throw so it's surfaced and counted properly.
      if (status === 403 && site === 1 && !trustedSlug) {
        throw new Error(`BAD_SLUG: HTTP 403 on first request (likely invalid slug). ${url}`);
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

interface ResolvedTarget {
  idExpansion: number;
  slug: string;
  name: string;
  /** True when the slug comes from a curated source (modern JSON, user-supplied
   * arg). False only for slugs derived from a DB name in --all mode for ancient
   * expansions not in the modern list. The BAD_SLUG safeguard fires only for
   * untrusted slugs — a 403 on a trusted slug means real bot detection, not a
   * bad URL, and must escalate normally. */
  trustedSlug: boolean;
}

/**
 * Derive a Cardmarket URL slug from an expansion display name. Verified to
 * reproduce 281/281 entries of the committed modern list. Rules:
 *   - NFD normalize, strip combining marks (accents → ASCII)
 *   - Drop apostrophes (' and ')
 *   - Drop ampersands (Cardmarket omits them, doesn't replace with "and")
 *   - Collapse ". " before a digit ("Vol. 5" → "Vol5"), Cardmarket merges
 *     the period and following whitespace rather than turning them into a dash
 *   - Strip everything else that's not a-z, 0-9, space, dash, or colon
 *   - Collapse whitespace, replace each space with a dash
 */
function nameToSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/&/g, '')
    .replace(/\. (?=\d)/g, '')
    .replace(/[^a-zA-Z0-9 \-:]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ /g, '-');
}

async function fetchAllExpansions(supabase: AnyClient): Promise<ResolvedTarget[]> {
  const modernMap = JSON.parse(readFileSync(MODERN_FILE, 'utf-8')) as Record<string, ModernEntry>;
  const { data, error } = await supabase
    .from('cardmarket_expansions')
    .select('id_expansion, name')
    .order('id_expansion', { ascending: false });
  if (error) throw new Error(`fetchAllExpansions: ${error.message}`);
  return (data ?? []).map((r: { id_expansion: number; name: string }) => {
    const curated = modernMap[String(r.id_expansion)];
    if (curated) {
      return { idExpansion: r.id_expansion, name: curated.name, slug: curated.slug, trustedSlug: true };
    }
    return { idExpansion: r.id_expansion, name: r.name, slug: nameToSlug(r.name), trustedSlug: false };
  });
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
      trustedSlug: true,
    }));
  }
  if (sinceId != null) {
    return Object.entries(modernMap)
      .filter(([id]) => Number(id) >= sinceId)
      .map(([id, e]) => ({ idExpansion: Number(id), slug: e.slug, name: e.name, trustedSlug: true }));
  }
  if (args.length > 0) {
    const slugToId = new Map(Object.entries(modernMap).map(([id, e]) => [e.slug, { id: Number(id), name: e.name }]));
    const resolved: ResolvedTarget[] = [];
    const unknownSlugs: string[] = [];
    for (const slug of args) {
      const found = slugToId.get(slug);
      if (found) {
        resolved.push({ idExpansion: found.id, slug, name: found.name, trustedSlug: true });
      } else {
        unknownSlugs.push(slug);
      }
    }
    // Fallback: resolve unknown slugs from DB (older expansions not in modern
    // list). User-supplied args are treated as trusted regardless — if the user
    // typed it, they presumably checked it works.
    if (unknownSlugs.length > 0) {
      if (!supabase) throw new Error(`Unknown slugs ${unknownSlugs.join(', ')} require Supabase access`);
      const all = await fetchAllExpansions(supabase);
      const slugMap = new Map(all.map((t) => [t.slug, t]));
      for (const slug of unknownSlugs) {
        const t = slugMap.get(slug);
        if (!t) throw new Error(`Unknown slug "${slug}" — not in modern JSON nor in cardmarket_expansions`);
        resolved.push({ ...t, trustedSlug: true });
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

  // channel: 'chrome' uses the system-installed Chrome — same TLS handshake
  // and client-hint headers as a real browser. Override with BROWSER_CHANNEL
  // env var: 'chromium' to use Playwright's bundled Chromium (e.g. on WSL
  // without google-chrome-stable installed), or 'msedge' / 'chrome-beta' /
  // etc. for other channels.
  const envChannel = process.env.BROWSER_CHANNEL;
  const channel = envChannel === 'chromium' ? undefined : (envChannel ?? 'chrome');
  const browser: Browser = await chromium.launch({
    headless: true,
    channel,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    userAgent: realisticUA(),
    viewport: { width: 1440, height: 900 },
    locale: 'fr-FR',
  });
  const page = await ctx.newPage();

  // Pre-flight: load the Pokemon homepage once. If Cloudflare 403s us here,
  // the IP/fingerprint is already flagged — abort BEFORE iterating expansions
  // so we don't burn the IP further by hammering it on a doomed run.
  console.log(`Pre-flight: ${PREFLIGHT_URL}`);
  const preflight = await page.goto(PREFLIGHT_URL, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
  const preflightStatus = preflight?.status() ?? 0;
  if (preflightStatus !== 200) {
    if (preflight && preflightStatus === 403) {
      await dump403Diagnostics(page, preflight, PREFLIGHT_URL);
    }
    await browser.close();
    throw new Error(`Pre-flight failed: HTTP ${preflightStatus} — IP/fingerprint already flagged. Wait or switch IP before retrying.`);
  }
  console.log(`Pre-flight OK (HTTP 200) — starting scrape.`);

  let totalCardsScraped = 0;
  let totalBlocked = 0;
  let consecutiveBadSlugs = 0;
  let successfulCount = 0;
  let abortAll = false;
  const failures: Array<{ slug: string; reason: string }> = [];
  const badSlugs: Array<{ idExpansion: number; name: string; derivedSlug: string }> = [];

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
      const { cards, blocked } = await scrapeOneExpansion(page, t.slug, t.trustedSlug);
      if (supabase) await upsertExpansion(supabase, { ...t, cards });
      totalCardsScraped += cards.length;
      totalBlocked += blocked;
      consecutiveBadSlugs = 0;
      successfulCount++;
      abortAll = tripped();
    } catch (err) {
      const reason = (err as Error).message;
      console.error(`  FAIL: ${reason}`);

      if (reason.startsWith('BAD_SLUG:')) {
        // Slug derivation issue — log for manual fix, don't count as ban.
        badSlugs.push({ idExpansion: t.idExpansion, name: t.name, derivedSlug: t.slug });
        consecutiveBadSlugs++;
        if (consecutiveBadSlugs >= CONSECUTIVE_BAD_SLUG_THRESHOLD) {
          console.log(
            `\nABORT: ${consecutiveBadSlugs} consecutive bad-slug 403s — likely bot detection misclassified, not slug bugs.`,
          );
          abortAll = true;
        }
      } else {
        failures.push({ slug: t.slug, reason });
        consecutiveBadSlugs = 0;
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
    }

    if (i < targets.length - 1 && !abortAll) {
      const isBatchBoundary = successfulCount > 0 && successfulCount % BATCH_SIZE === 0;
      if (isBatchBoundary) {
        const cool = jitter(BATCH_COOLDOWN_MS, 120_000);
        console.log(`    batch boundary: cooling ${Math.round(cool / 1000)}s after ${successfulCount} successful expansions...`);
        await sleep(cool);
      } else {
        const delay = jitter(INTER_EXPANSION_DELAY_MS, 20_000);
        console.log(`    waiting ${Math.round(delay / 1000)}s before next expansion...`);
        await sleep(delay);
      }
    }
  }

  await browser.close();

  console.log(`\nDone. ${totalCardsScraped} cards across ${targets.length - failures.length - badSlugs.length}/${targets.length} expansions.`);
  if (totalBlocked > 0) console.log(`  ${totalBlocked} total 429 responses.`);
  if (failures.length > 0) {
    console.log(`\n${failures.length} hard failure(s):`);
    for (const f of failures) console.log(`  - ${f.slug}: ${f.reason}`);
  }
  if (badSlugs.length > 0) {
    writeFileSync(BAD_SLUGS_FILE, JSON.stringify(badSlugs, null, 2));
    console.log(`\n${badSlugs.length} bad slug(s) — derived URL returned 403 on first request.`);
    console.log(`  Logged to ${BAD_SLUGS_FILE}`);
    console.log(`  Resolve by adding correct slugs to ${MODERN_FILE} (then re-run with --force on those id_expansions).`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
