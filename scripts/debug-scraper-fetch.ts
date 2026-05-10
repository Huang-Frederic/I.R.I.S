/**
 * Debug helper: fetch ONE cardmarket expansion page via BrightData (same code
 * path as the scraper) and dump the HTML to disk for inspection.
 *
 * Usage:
 *   npx tsx scripts/debug-scraper-fetch.ts <idExpansion> <slug>
 *
 * Examples:
 *   npx tsx scripts/debug-scraper-fetch.ts 5257 Triplet-Beat
 *   npx tsx scripts/debug-scraper-fetch.ts 5328 Pokemon-Card-151
 *
 * Reports:
 *   - URL fetched, HTTP status, response size
 *   - Whether the response contains the `galleryBox` marker (= the gallery is rendered)
 *   - Whether it contains `noResults` markers (= empty page)
 *   - Whether redirected (= wrong slug)
 *   - Saves HTML to /tmp/cm-debug-<id>.html
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
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

const TOKEN = process.env.BRIGHTDATA_TOKEN;
const ZONE = process.env.BRIGHTDATA_ZONE ?? 'iris';
if (!TOKEN) {
  console.error('Missing BRIGHTDATA_TOKEN in env');
  process.exit(1);
}

const idExpansion = Number(process.argv[2]);
const slug = process.argv[3];
if (!idExpansion || !slug) {
  console.error('Usage: npx tsx scripts/debug-scraper-fetch.ts <idExpansion> <slug>');
  process.exit(1);
}

// Two URLs to try: minimal (like user's working browser URL) and full (like our scraper).
const URL_MINIMAL = `https://www.cardmarket.com/fr/Pokemon/Products/Singles/${encodeURIComponent(slug)}?perSite=30`;
const URL_FULL = `https://www.cardmarket.com/fr/Pokemon/Products/Singles/${encodeURIComponent(slug)}?searchMode=v2&idCategory=51&idExpansion=${idExpansion}&idRarity=0&sortBy=collectorsnumber_asc&perSite=30&site=1`;

async function fetchViaBrightData(url: string): Promise<{ status: number; body: string } | null> {
  try {
    const res = await fetch('https://api.brightdata.com/request', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ zone: ZONE, url, format: 'raw' }),
      signal: AbortSignal.timeout(60_000),
    });
    const body = await res.text();
    return { status: res.status, body };
  } catch (e) {
    console.error('BrightData fetch failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

function diagnose(label: string, url: string, body: string) {
  const sizeKb = (body.length / 1024).toFixed(1);
  const galleryCount = (body.match(/galleryBox/g) || []).length;
  const noResults = body.includes('noResults') || body.includes('No results') || body.includes('Aucun résultat');
  const redirected = /<meta[^>]*http-equiv=["']?refresh/i.test(body);
  const captcha = /captcha|cf-challenge|Just a moment/i.test(body);
  console.log(`\n=== ${label} ===`);
  console.log(`URL:          ${url}`);
  console.log(`Size:         ${sizeKb} KB`);
  console.log(`galleryBox:   ${galleryCount} occurrences`);
  console.log(`noResults:    ${noResults}`);
  console.log(`redirected:   ${redirected}`);
  console.log(`captcha-ish:  ${captcha}`);
  // Try to extract the page title
  const titleMatch = body.match(/<title>([^<]+)<\/title>/);
  console.log(`<title>:      ${titleMatch?.[1]?.trim() ?? '(none)'}`);
  // Sample first product link
  const firstLink = body.match(/href=["'](\/[a-z]{2}\/Pokemon\/Products\/Singles\/[^"']+)["']/);
  console.log(`first href:   ${firstLink?.[1] ?? '(none)'}`);
}

async function main() {
  console.log(`Debugging expansion ${idExpansion} (slug=${slug})\n`);

  console.log('Fetching MINIMAL URL (user-style)…');
  const minimal = await fetchViaBrightData(URL_MINIMAL);
  if (minimal) {
    diagnose('MINIMAL', URL_MINIMAL, minimal.body);
    writeFileSync(`/tmp/cm-debug-${idExpansion}-minimal.html`, minimal.body);
    console.log(`\nSaved → /tmp/cm-debug-${idExpansion}-minimal.html`);
  }

  console.log('\nFetching FULL URL (scraper-style)…');
  const full = await fetchViaBrightData(URL_FULL);
  if (full) {
    diagnose('FULL', URL_FULL, full.body);
    writeFileSync(`/tmp/cm-debug-${idExpansion}-full.html`, full.body);
    console.log(`\nSaved → /tmp/cm-debug-${idExpansion}-full.html`);
  }
}

main();
