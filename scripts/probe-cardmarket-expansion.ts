// scripts/probe-cardmarket-expansion.ts
//
// One-shot probe: opens a single Cardmarket expansion page in headless
// Chromium, dumps the body HTML to disk, and reports a few quick stats.
// Used to figure out the page structure before writing the real scraper.
//
// Usage:
//   npx tsx scripts/probe-cardmarket-expansion.ts <expansion-name-slug>
//
// The slug is the URL fragment after /Singles/, e.g. "Crimson-Haze" for
// https://www.cardmarket.com/fr/Pokemon/Products/Singles/Crimson-Haze

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: npx tsx scripts/probe-cardmarket-expansion.ts <expansion-name-slug>');
  console.error('Example: npx tsx scripts/probe-cardmarket-expansion.ts Crimson-Haze');
  process.exit(1);
}

const URL = `https://www.cardmarket.com/fr/Pokemon/Products/Singles/${slug}?idRarity=0`;
// Slugs can contain "/" (when probing a card detail page like
// "Crimson-Haze/Bloodmoon-Ursaluna-ex-V1-sv5a052"). Flatten to a safe filename.
const safeName = slug.replace(/[\/\\]/g, '__');
const OUT = path.resolve(process.cwd(), `cardmarket-probe-${safeName}.html`);

async function main(): Promise<void> {
  const browser = await chromium.launch({
    headless: true,
    // A real Chrome User-Agent + viewport help dodge naive bot heuristics.
    // If Cloudflare still blocks, we'll switch to headless: false or a
    // dedicated stealth plugin.
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'fr-FR',
  });
  const page = await ctx.newPage();

  console.log(`Navigating to ${URL}`);
  const resp = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  console.log(`HTTP ${resp?.status()}, final URL ${page.url()}`);

  // Wait a bit for client-side rendering / Cloudflare check to settle.
  await page.waitForTimeout(3_000);

  const title = await page.title();
  console.log(`Page title: "${title}"`);

  if (/just a moment|cloudflare|attention required/i.test(title)) {
    console.error('\n⚠ Cloudflare challenge detected — page returned a CF interstitial.');
    console.error('  Try again, or fall back to headless:false / stealth plugin.');
  }

  const html = await page.content();
  writeFileSync(OUT, html);
  console.log(`\nDumped ${(html.length / 1024).toFixed(0)} KB to ${OUT}`);

  // Quick structure summary so the user can paste it without copying the whole file.
  const linkCount = await page.locator('a[href*="/Pokemon/Products/Singles/"]').count();
  const tableRowCount = await page.locator('div.table-body div, .product-row, tr').count();
  console.log(`\nQuick stats:`);
  console.log(`  - product-singles links: ${linkCount}`);
  console.log(`  - candidate row elements: ${tableRowCount}`);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
