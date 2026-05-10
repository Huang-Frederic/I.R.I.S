import 'dotenv/config';
import { Actor } from 'apify';
import { JSDOM } from 'jsdom';
import {
  createServiceClient,
  expansionAlreadyIndexed,
  upsertCards,
} from './supabase.js';
import { extractCardsFromDocument } from './scrape.js';
import type { ActorInput, ExpansionInput, ScrapedCard } from './types.js';

const BASE_URL = 'https://www.cardmarket.com/fr/Pokemon/Products/Singles';
const LANGUAGE = 'fr';
const BRIGHTDATA_ENDPOINT = 'https://api.brightdata.com/request';
const REQUEST_TIMEOUT_MS = 60_000;
const MIN_PAGE_DELAY_MS = 500;
const MAX_PAGE_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min));
}

function buildUrl(slug: string, idExpansion: number, perPage: number, site: number): string {
  const params = new URLSearchParams({
    searchMode: 'v2',
    idCategory: '51',
    idExpansion: String(idExpansion),
    idRarity: '0',
    sortBy: 'collectorsnumber_asc',
    perSite: String(perPage),
    site: String(site),
  });
  return `${BASE_URL}/${slug}?${params.toString()}`;
}

async function fetchHtmlViaBrightData(
  token: string,
  zone: string,
  url: string,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(BRIGHTDATA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        zone,
        url,
        format: 'raw',
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`BrightData HTTP ${response.status}: ${body.slice(0, 200)}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function scrapePage(
  token: string,
  zone: string,
  url: string,
): Promise<ScrapedCard[]> {
  const html = await fetchHtmlViaBrightData(token, zone, url);

  // Cardmarket renders an empty gallery (or a "no results" panel) when the
  // page is past the last result. Quick heuristic: if no <a class="galleryBox">
  // tags are present, we've paginated past the end.
  if (!html.includes('galleryBox')) {
    return [];
  }

  const dom = new JSDOM(html);
  return extractCardsFromDocument(dom.window.document as unknown as Document);
}

async function scrapeExpansion(
  token: string,
  zone: string,
  expansion: ExpansionInput,
  perPage: number,
): Promise<ScrapedCard[]> {
  const all: ScrapedCard[] = [];
  const seen = new Set<string>();

  for (let site = 1; site <= 50; site++) {
    const url = buildUrl(expansion.slug, expansion.idExpansion, perPage, site);
    const cards = await scrapePage(token, zone, url);

    if (cards.length === 0) break;

    let added = 0;
    for (const c of cards) {
      const key = `${c.setNumber}|${c.urlVariant ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(c);
      added++;
    }

    if (added === 0) break;

    await sleep(jitter(MIN_PAGE_DELAY_MS, MAX_PAGE_DELAY_MS));
  }

  return all;
}

async function processOneExpansion(
  token: string,
  zone: string,
  expansion: ExpansionInput,
  perPage: number,
  skipExisting: boolean,
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ status: 'skipped' | 'success' | 'failed'; count: number; error?: string }> {
  try {
    if (skipExisting) {
      const exists = await expansionAlreadyIndexed(
        supabase,
        expansion.idExpansion,
      );
      if (exists) {
        console.log(
          `[${expansion.idExpansion}] ${expansion.name} → skipped (already indexed)`,
        );
        return { status: 'skipped', count: 0 };
      }
    }

    console.log(`[${expansion.idExpansion}] ${expansion.name} → scraping…`);
    const cards = await scrapeExpansion(token, zone, expansion, perPage);
    const inserted = await upsertCards(supabase, expansion.idExpansion, LANGUAGE, cards);
    console.log(
      `[${expansion.idExpansion}] ${expansion.name} → ${inserted} cards upserted`,
    );
    return { status: 'success', count: inserted };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${expansion.idExpansion}] ${expansion.name} → FAILED: ${msg}`);
    return { status: 'failed', count: 0, error: msg };
  }
}

await Actor.init();

const input = (await Actor.getInput<ActorInput>()) ?? {
  expansions: [],
  skipExisting: true,
  concurrency: 3,
  perPage: 30,
};

const expansions = input.expansions ?? [];
const skipExisting = input.skipExisting ?? true;
const concurrency = Math.max(1, Math.min(10, input.concurrency ?? 3));
const perPage = Math.max(30, Math.min(100, input.perPage ?? 30));

const brightdataToken = process.env.BRIGHTDATA_TOKEN;
const brightdataZone = process.env.BRIGHTDATA_ZONE ?? 'web_unlocker1';

if (!brightdataToken) {
  console.error('BRIGHTDATA_TOKEN must be set in env (Apify secret or .env locally)');
  await Actor.exit();
  process.exit(1);
}

console.log(
  `Starting scrape: ${expansions.length} expansions, concurrency=${concurrency}, perPage=${perPage}, skipExisting=${skipExisting}, zone=${brightdataZone}`,
);

if (expansions.length === 0) {
  console.warn('No expansions in input; nothing to do.');
  await Actor.exit();
  process.exit(0);
}

const supabase = createServiceClient();

let processed = 0;
let succeeded = 0;
let skipped = 0;
let failed = 0;
let totalRows = 0;
const failures: { idExpansion: number; name: string; error: string }[] = [];

const queue = [...expansions];
const workers: Promise<void>[] = [];

async function worker(): Promise<void> {
  while (queue.length > 0) {
    const expansion = queue.shift();
    if (!expansion) return;
    const result = await processOneExpansion(
      brightdataToken!,
      brightdataZone,
      expansion,
      perPage,
      skipExisting,
      supabase,
    );
    processed++;
    if (result.status === 'success') {
      succeeded++;
      totalRows += result.count;
    } else if (result.status === 'skipped') {
      skipped++;
    } else {
      failed++;
      failures.push({
        idExpansion: expansion.idExpansion,
        name: expansion.name,
        error: result.error ?? 'unknown',
      });
    }
    if (processed % 10 === 0) {
      console.log(
        `Progress: ${processed}/${expansions.length} (${succeeded} ok, ${skipped} skipped, ${failed} failed)`,
      );
    }
  }
}

for (let i = 0; i < concurrency; i++) {
  workers.push(worker());
}
await Promise.all(workers);

const summary = {
  total: expansions.length,
  succeeded,
  skipped,
  failed,
  totalRowsInserted: totalRows,
  failures,
};

console.log('=== Summary ===');
console.log(JSON.stringify(summary, null, 2));

await Actor.setValue('SUMMARY', summary);

await Actor.exit();
