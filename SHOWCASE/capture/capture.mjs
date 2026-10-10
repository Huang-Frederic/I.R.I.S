#!/usr/bin/env node
/**
 * Showcase capture: regenerates every image in SHOWCASE/media/.
 *
 *   cd SHOWCASE/capture
 *   npm install                           once: Playwright, the Supabase CLI and pg, in this folder only
 *   npx playwright install chromium       once: the browser
 *   node capture.mjs                      every shot (Docker must be running)
 *   node capture.mjs dashboard vinted     only these shots
 *   node capture.mjs --keep               leave the local stack and the app running afterwards
 *   node capture.mjs --reuse vinted       iterate on a shot: reuse the loaded stack and a running app (implies --keep)
 *   node capture.mjs --serve              no shots: serve the seeded app on 127.0.0.1:3100 to click around in
 *
 * Nothing here touches the production project. The script starts a throwaway
 * Supabase in Docker from the project's own migrations (stack.mjs), loads the
 * sanitized fixtures (seed.mjs), serves the app against it with every external
 * key blanked (app.mjs), signs in with the fixture account, and records each
 * shot. The scanner's OCR call is answered from fixtures/scan.json, so no
 * Gemini key is needed; the enrichment behind it runs for real, on the local
 * catalog.
 *
 * Also needs ffmpeg and Python 3 (make_gif.py sits next to this file; the
 * command is `python3`, or `python` on Windows, or whatever PYTHON is set
 * to). Everything it writes goes to SHOWCASE/media/; its working files go to
 * the system's temporary folder and are deleted.
 *
 * GIFs are recorded with the Chrome DevTools screencast as lossless PNG frames
 * (only while a clip is running), then turned into a 960x540 GIF by make_gif.py.
 * Lossless frames matter: video recordings carry compression noise in every
 * frame, which makes GIFs five to ten times heavier.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { APP_URL, startApp } from './app.mjs';
import { fixture, heartbeat, seed } from './seed.mjs';
import { start as startStack, stop as stopStack } from './stack.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUT = join(ROOT, 'SHOWCASE/media');
const MAKE_GIF = join(HERE, 'make_gif.py');
const PYTHON = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
const DESKTOP = { width: 1920, height: 1080 };
const PHONE = { viewport: { width: 390, height: 844 }, scale: 2, mobile: true };
// The UI language of every shot: the app's daily language. The README tells
// the story in English; the 4-language toggle has its own shot.
const LANG = 'fr';

// ─── Fixtures ──────────────────────────────────────────────────────────────
// The OCR is the one call answered here: the photo's file name says which
// card it is, and the answer is what Gemini returns for it (lib/api/gemini-vision.ts).
const SCAN = fixture('scan');
const POKEMON_NAMES = JSON.parse(readFileSync(join(ROOT, 'lib/data/pokemon-names.json'), 'utf8'));
const PRINTED_PREFIX = { sv2a: 'SV2a', ASC: 'ASC' };
// Gemini names the rarity in words; the enrich route maps them to the enum.
const GEMINI_RARITY = { C: 'common', UC: 'uncommon', R: 'rare', R_HOLO: 'holo rare', RR: 'double rare', SR: 'ultra rare', AR: 'art rare', SAR: 'special art rare' };

function ocrAnswer(card) {
  const names = POKEMON_NAMES[String(card.pokemon_number)] ?? {};
  const prefix = PRINTED_PREFIX[card.set_code] ?? card.set_code;
  return {
    text: `${card.card_name} | ${card.pokemon_name} | ${prefix}-${card.set_number} | ${card.language}`,
    confidence: 0.95,
    words: [],
    setNumberCandidate: { card: card.set_number, total: '', raw: card.set_number },
    setCodeCandidate: prefix,
    pokemonNumber: card.pokemon_number,
    pokemonNameFr: names.fr ?? null,
    pokemonNameEn: names.en ?? null,
    cardNameFr: null,
    language: card.language,
    cardName: card.card_name.replace(/\s*\(.*\)$/, ''),
    pokemonName: card.pokemon_name.replace(/\s*\(.*\)$/, ''),
    rarity: GEMINI_RARITY[card.rarity] ?? null,
    illustrator: null,
    _usage: { tokens_in: 2531, tokens_out: 31, tokens_image_est: 1066, cost_eur: 0.004797 },
    _engine: 'gemini',
  };
}

async function setup(page) {
  // A real scan takes a second or two: answer as slowly, so the progress shows.
  await page.route('**/api/ocr', async (route) => {
    const body = route.request().postDataBuffer()?.toString('latin1') ?? '';
    const name = /filename="([^"]+)"/.exec(body)?.[1] ?? '';
    const card = SCAN.find((c) => name.includes(c.photo.split('/').pop().replace('.jpg', ''))) ?? SCAN[0];
    await new Promise((r) => setTimeout(r, 600 + 250 * SCAN.indexOf(card)));
    await route.fulfill({ json: ocrAnswer(card) });
  });
  await page.addInitScript(() => {
    // The Next.js dev badge and its issue counter are not part of the app.
    const style = () => {
      const tag = document.createElement('style');
      tag.textContent = 'nextjs-portal { display: none !important; }';
      document.head.append(tag);
    };
    if (document.head) style();
    else document.addEventListener('DOMContentLoaded', style);
  });
}

// ─── Helpers for the shot list ──────────────────────────────────────────────

const url = (path) => new URL(path.replace(/^\//, ''), `${APP_URL}/`).href;

/** Goes to a page and waits until it is fully drawn: data, fonts, images. */
async function open(page, path) {
  await page.goto(url(path), { timeout: 120_000 });
  await settle(page);
}

async function settle(page, extra = 400) {
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
  // A click in the nav swaps the page client-side: wait for the route's loading
  // skeleton (app/(app)/loading.tsx) to give way to the page itself.
  await until(page, () => !document.querySelector('div.animate-pulse[aria-hidden]') && !!document.querySelector('main h1')).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  // Every image on screen loaded; lazy ones further down load when scrolled to.
  await until(page, () => [...document.images].every((img) => {
    const box = img.getBoundingClientRect();
    return img.complete || box.bottom < 0 || box.top > innerHeight || box.width === 0;
  }), 30_000).catch(() => {});
  await page.waitForTimeout(extra);
  await redact(page);
}

/**
 * The partner's first name is hard-coded in two labels (dashboard sales tiles,
 * activity-log badges); everywhere else the app shows her display name,
 * "Elle". The shots use the display name too.
 */
async function redact(page) {
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      // A card is also called "Gilly (ギリー)": a name followed by its Japanese is left alone.
      if (/\bGilly\b/i.test(node.nodeValue)) node.nodeValue = node.nodeValue.replace(/\bGilly\b(?!\s*\()/g, 'Elle').replace(/\bGILLY\b(?!\s*\()/g, 'ELLE');
    }
  });
}

/** Waits until `condition` (a function run in the page) returns true. */
const until = (page, condition, timeout = 60_000) => page.waitForFunction(condition, null, { timeout, polling: 100 });

/** The bot page fills its queue client-side: true once the cards are on screen. */
const queueLoaded = () => document.querySelectorAll('main img').length > 8;

/** Opens the bot page, its queue loaded. */
async function openBot(page) {
  await open(page, '/vinted/bot');
  await until(page, queueLoaded);
  await settle(page);
}

/**
 * The overview tour. For each stop, goes to the page (`go`: a path relative to
 * APP_URL, or a function that gets there the way a user would, by clicking),
 * holds on it for `hold` ms, then scrolls through it when `scroll` is set (true,
 * or options for scrollThrough). The clip pauses while a page loads, so blank
 * pages and spinners never show.
 */
async function tour(page, clip, stops) {
  for (const stop of stops) {
    await clip.stop();
    if (typeof stop.go === 'function') await stop.go(page);
    else await page.goto(url(stop.go));
    // A click navigates client-side: wait for the new route to be on screen.
    if (stop.path) await page.waitForURL((u) => u.pathname === stop.path, { timeout: 60_000 });
    if (stop.ready) await until(page, stop.ready);
    await settle(page, stop.settle ?? 500);
    await clip.start();
    await page.waitForTimeout(stop.hold ?? 1200);
    if (stop.scroll) await scrollThrough(page, stop.scroll === true ? {} : stop.scroll);
  }
  await clip.stop();
}

/**
 * Scrolls through the page (or the scrolling panel under the middle of the
 * screen) in smooth steps of `step` screen heights, pausing `pause` ms after
 * each so a reader can follow, until the bottom or `maxSteps`. The pauses also
 * keep the GIF light: a still frame costs almost nothing, a moving one a lot.
 */
async function scrollThrough(page, { step = 0.7, pause = 900, maxSteps = 6 } = {}) {
  const { width, height } = page.viewportSize();
  await page.mouse.move(width / 2, height / 2);
  for (let i = 0; i < maxSteps; i++) {
    const before = await scrolled(page);
    for (let k = 0; k < 8; k++) {
      await page.mouse.wheel(0, (height * step) / 8);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(pause);
    if ((await scrolled(page)) === before) break; // the bottom
  }
}

/** How far the page and its scrolling panels are scrolled, all added up. */
const scrolled = (page) => page.evaluate(() => [...document.querySelectorAll('*')].reduce((sum, el) => sum + el.scrollTop, 0));

// ─── The shot list ─────────────────────────────────────────────────────────
// - png: run() prepares the page; return a locator to capture one element.
//   Options: viewport, scale, mobile, fullPage, omitBackground, clip ({ x, y,
//   width, height }: a region of the page), resize ('1280x640', applied last).
// - gif: wrap each moment worth showing in `await clip.start()` and
//   `await clip.stop()`; moments are joined in order. Options: viewport, fps,
//   speed, maxMb, crop ('W:H:X:Y'), pad.
const SHOTS = {
  logo: {
    png: { viewport: { width: 512, height: 512 }, omitBackground: true },
    async run({ page }) {
      const logo = readFileSync(join(ROOT, 'public/logo.png')).toString('base64');
      await page.setContent(`<style>html,body{margin:0;background:transparent}</style><img src="data:image/png;base64,${logo}" width="512" height="512">`);
    },
  },

  // The tour: the dashboard top to bottom, then the pages a new user opens first.
  'quick-overview': {
    gif: { fps: 10, speed: 1.25, maxMb: 6 },
    async run({ page, clip, env }) {
      await env.heartbeat();
      await tour(page, clip, [
        { go: '/dashboard?period=30d', scroll: { maxSteps: 3 }, settle: 1800 },
        { go: (p) => p.getByRole('link', { name: 'Pokédex' }).first().click(), path: '/pokedex', hold: 1600 },
        { go: (p) => p.getByRole('link', { name: 'Vinted', exact: true }).first().click(), path: '/vinted', scroll: { maxSteps: 2 } },
        { go: (p) => p.getByRole('link', { name: 'Bot Vinted' }).first().click(), path: '/vinted/bot', ready: queueLoaded, hold: 1800 },
        { go: (p) => p.getByRole('link', { name: 'Stats' }).first().click(), path: '/ptcg/stats', hold: 1400 },
      ]);
    },
  },

  // ── 1. The scan ─────────────────────────────────────────────────────────
  scanner: {
    gif: { fps: 12, speed: 1.15, maxMb: 4, crop: '1200:675:470:0' },
    async run({ page, clip, still, env }) {
      // The scanned cards are saved for real: remove them afterwards, so the
      // other shots (and the next run) see the collection as seeded.
      const { rows } = await env.db.query('select now() as started');
      env.cleanups.push(() => env.db.query('delete from public.cards where date_added >= $1', [rows[0].started]));
      await open(page, '/submit');
      await clip.start();
      await page.locator('input[type=file]').first().setInputFiles(SCAN.map((c) => join(HERE, 'fixtures/photos', c.photo)));
      await page.waitForTimeout(700);
      await page.getByRole('button', { name: /^Analyser 3/ }).click();
      await page.getByRole('button', { name: 'Enregistrer', exact: true }).waitFor({ timeout: 60_000 });
      await settle(page, 600);
      await page.waitForTimeout(1700);
      await clip.stop();
      await still('scan-review');
      for (let i = 0; i < SCAN.length; i++) {
        await clip.start();
        // Straight to the Vinted pile: no Pokédex swap dialog in the middle of the GIF.
        await page.locator('select:has(option[value="for_sale"])').selectOption('for_sale');
        await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
        await page.waitForTimeout(300);
        await clip.stop(); // the next card's photo loads off camera
        await settle(page, 200);
        await clip.start();
        await page.waitForTimeout(i < SCAN.length - 1 ? 1500 : 2200);
        await clip.stop();
      }
    },
  },

  'lot-form': {
    png: {},
    async run({ page }) {
      await open(page, '/submit');
      await page.getByRole('button', { name: 'Autre & Lot' }).click();
      await settle(page);
      const lot = fixture('lots')[0];
      await page.locator('input[type=file]').first().setInputFiles(join(HERE, 'fixtures/photos/lots', lot.photo_urls[0]));
      await page.getByPlaceholder('[Title]').fill('Darkrai ex & Wailord ex — Abyss Eye');
      await page.getByPlaceholder('ex: 12.50').fill('5');
      await page.getByPlaceholder('État, contenu, détails…').fill('2 cartes ex japonaises, sorties de booster et mises sous sleeve.');
      await settle(page);
    },
  },

  'item-form': {
    png: {},
    async run({ page }) {
      await open(page, '/submit');
      await page.getByRole('button', { name: 'Objets' }).click();
      await settle(page);
      const item = fixture('other_items').find((i) => i.vinted_catalog_path.endsWith('Jeans'));
      await page.locator('input[type=file]').first().setInputFiles(join(HERE, 'fixtures/photos/items', item.photo_urls[0]));
      await page.getByLabel('Titre').fill(item.name);
      await page.getByRole('combobox').first().fill('jeans');
      await page.getByRole('option', { name: item.vinted_catalog_path, exact: true }).click();
      await page.getByLabel('Prix (€)').fill(String(item.price));
      await page.getByLabel('Marque (optionnel)').fill("Levi's");
      await page.waitForTimeout(800); // the category's sizes load
      await settle(page);
    },
  },

  // ── 2. Where it goes ─────────────────────────────────────────────────────
  pokedex: {
    png: {},
    async run({ page }) {
      await open(page, '/pokedex?pokemon_number=25');
      await page.waitForTimeout(1500); // the drawer slides in, the chart draws
      await page.evaluate(() => window.scrollTo(0, 0));
      await settle(page);
    },
  },

  stock: {
    png: {},
    async run({ page }) {
      await open(page, '/stock');
    },
  },

  stamps: {
    png: {},
    async run({ page }) {
      await open(page, '/stamps');
    },
  },

  // ── 3. The sell ──────────────────────────────────────────────────────────
  vinted: {
    png: {},
    async run({ page }) {
      await open(page, '/vinted');
      // The listings that are up: stale ones first (red), then the fresh ones.
      await page.getByRole('button', { name: 'En ligne', exact: true }).click();
      await settle(page);
    },
  },

  listing: {
    png: {},
    async run({ page }) {
      await open(page, '/vinted');
      await page.getByPlaceholder('Recherche : nom, set, n°…').fill('Zacian ex de Nabil');
      await page.waitForTimeout(800);
      await page.getByRole('button', { name: 'Annonce', exact: true }).first().click();
      await page.waitForTimeout(1500);
      await settle(page);
    },
  },

  'bulk-sold': {
    png: {},
    async run({ page }) {
      await open(page, '/vinted');
      await page.getByRole('button', { name: 'Sélection multiple' }).click();
      const boxes = page.locator('main input[type=checkbox]');
      for (let i = 0; i < 3; i++) await boxes.nth(i).check();
      await page.getByRole('button', { name: /^Vendre la sélection/ }).click();
      await page.getByLabel(/Prix total reçu/).fill('25');
      await settle(page);
    },
  },

  lots: {
    png: {},
    async run({ page }) {
      await open(page, '/vinted');
      await page.getByRole('button', { name: 'Lots', exact: true }).click();
      await settle(page);
      await page.getByRole('button', { name: 'Annonce', exact: true }).first().click();
      await page.waitForTimeout(1200);
      await settle(page);
    },
  },

  items: {
    png: {},
    async run({ page }) {
      await open(page, '/vinted');
      await page.getByRole('button', { name: 'Items', exact: true }).click();
      await settle(page);
    },
  },

  // ── 4. The bot ───────────────────────────────────────────────────────────
  'vinted-bot': {
    png: {},
    async run({ page, env }) {
      // A job in progress, as the agent leaves it while it posts.
      const [owner] = env.users;
      const { rows } = await env.db.query('select card_id from public.vinted_queue where user_id = $1 and card_id is not null order by position limit 1', [owner.id]);
      await env.db.query("delete from public.vinted_post_jobs where status = 'processing'");
      env.cleanups.push(() => env.db.query("delete from public.vinted_post_jobs where status = 'processing'"));
      await env.db.query(
        `insert into public.vinted_post_jobs (card_id, status, user_id, job_type, triggered_by, created_at)
         values ($1, 'processing', $2, 'post', 'schedule', now() - interval '41 seconds')`,
        [rows[0].card_id, owner.id],
      );
      await env.heartbeat();
      await openBot(page);
    },
  },

  'bot-settings': {
    png: {},
    async run({ page, env }) {
      await env.heartbeat();
      await openBot(page);
      await page.getByRole('button', { name: 'Paramètres' }).click();
      await page.waitForTimeout(800);
      await settle(page);
    },
  },

  'bot-logs': {
    png: {},
    async run({ page, env }) {
      await env.heartbeat();
      await openBot(page);
      await page.getByRole('button', { name: 'Logs' }).click();
      await page.waitForTimeout(800);
      await settle(page);
    },
  },

  // ── 5. The numbers ───────────────────────────────────────────────────────
  dashboard: {
    png: {},
    async run({ page, env }) {
      await env.heartbeat();
      await open(page, '/dashboard?period=30d');
      // Step back to the latest day with scans, so the day tile is not empty.
      for (let i = 0; i < 14; i++) {
        const ocr = await page.locator('main').getByText(/^\d+$/).first().innerText();
        if (Number(ocr) > 0) break;
        await page.getByRole('button', { name: 'Jour précédent' }).click();
        await page.waitForTimeout(400);
      }
      await page.waitForTimeout(1500); // the donut animates in
      await settle(page);
    },
  },

  prices: {
    png: {},
    async run({ page }) {
      await open(page, '/prices');
      await page.waitForTimeout(1500);
    },
  },

  'price-detail': {
    png: {},
    async run({ page }) {
      await open(page, '/prices');
      await page.getByPlaceholder('Rechercher…').fill('Lucario VSTAR');
      await page.waitForTimeout(600);
      await page.locator('main').getByText(/^Lucario VSTAR/).first().click();
      await page.waitForTimeout(1500);
      await settle(page);
    },
  },

  activity: {
    png: {},
    async run({ page }) {
      await open(page, '/logs');
    },
  },

  options: {
    png: {},
    async run({ page }) {
      await open(page, '/options');
    },
  },

  languages: {
    png: { lang: 'ja' },
    async run({ page }) {
      await open(page, '/pokedex');
    },
  },

  // ── 6. The game ──────────────────────────────────────────────────────────
  'battle-logs': {
    png: {},
    async run({ page }) {
      await open(page, '/ptcg');
      await page.getByRole('button', { name: /^\d{2}\/\d{2}\/\d{4}/ }).nth(1).click();
      await page.waitForTimeout(500);
      await page.locator('main').getByText(/contre /).first().click();
      await page.waitForTimeout(1200);
      await settle(page);
    },
  },

  'ptcg-stats': {
    png: {},
    async run({ page }) {
      await open(page, '/ptcg/stats');
      await page.locator('main button').first().click();
      await settle(page);
      await page.locator('main button').nth(1).click();
      await page.waitForTimeout(800);
      await settle(page);
    },
  },

  tournament: {
    png: {},
    async run({ page }) {
      await open(page, '/ptcg/tournaments');
      await page.getByRole('link', { name: /Défi de Ligue Gentlemen/ }).click();
      await page.waitForURL('**/ptcg/tournaments/*');
      await settle(page);
    },
  },

  drill: {
    png: {},
    async run({ page }) {
      await open(page, '/drill');
      await page.getByRole('button', { name: 'Démarrer' }).first().click();
      await page.getByRole('button', { name: /^Standard/ }).click();
      await page.waitForTimeout(3500); // the cards preload, then the clock starts
      await settle(page);
    },
  },

  events: {
    png: {},
    async run({ page }) {
      await open(page, '/events');
    },
  },

  // ── On a phone ───────────────────────────────────────────────────────────
  'mobile-vinted': {
    png: PHONE,
    async run({ page }) {
      await open(page, '/vinted');
    },
  },

  'mobile-pokedex': {
    png: PHONE,
    async run({ page }) {
      await open(page, '/pokedex');
    },
  },

  'mobile-menu': {
    png: PHONE,
    async run({ page }) {
      await open(page, '/dashboard');
      await page.getByRole('button', { name: /plus|more/i }).last().click();
      await page.waitForTimeout(900);
    },
  },

  // The cover: 1280x640, the logo and the name next to two screens of the app.
  cover: {
    png: { viewport: { width: 1280, height: 640 } },
    async run({ page }) {
      const img = (file) => `data:image/png;base64,${readFileSync(join(OUT, file)).toString('base64')}`;
      const logo = readFileSync(join(ROOT, 'public/logo.png')).toString('base64');
      await page.setContent(`<!doctype html><html><head><style>
        body { margin: 0; width: 1280px; height: 640px; background: #111110; color: #e8e6e3; font-family: 'Segoe UI', system-ui, sans-serif; overflow: hidden; position: relative; }
        .text { position: absolute; left: 72px; top: 150px; width: 470px; }
        .text img { width: 96px; height: 96px; }
        h1 { font-size: 72px; margin: 18px 0 6px; letter-spacing: 1px; color: #e05252; }
        h2 { font-size: 22px; margin: 0 0 22px; font-weight: 500; color: #8a8885; }
        p { font-size: 22px; line-height: 1.45; margin: 0; }
        .shot { position: absolute; border-radius: 14px; border: 1px solid #333230; box-shadow: 0 24px 60px rgba(0,0,0,.6); }
        .a { width: 720px; left: 600px; top: 70px; }
        .b { width: 560px; left: 760px; top: 330px; }
      </style></head><body>
        <div class="text"><img src="data:image/png;base64,${logo}"><h1>I.R.I.S</h1><h2>Intelligent Recognition Inventory System</h2>
        <p>Scan, price and sell a shared Pokémon TCG collection.</p></div>
        <img class="shot a" src="${img('dashboard.png')}"><img class="shot b" src="${img('vinted-bot.png')}">
      </body></html>`);
    },
  },
};

// ─── Machinery (no need to edit) ────────────────────────────────────────────

/** Records lossless frames while started; any number of start/stop moments. */
class Clip {
  constructor(page, dir) {
    this.page = page;
    this.dir = dir;
    this.frames = [];
    this.count = 0;
    this.recording = false;
    this.cdp = null;
  }

  async start({ keep = Infinity } = {}) {
    if (this.recording) return;
    this.cdp ??= await this.page.context().newCDPSession(this.page);
    this.cdp.on('Page.screencastFrame', (frame) => this.onFrame(frame));
    this.recording = true;
    this.keep = keep;
    this.momentStart = this.frames.length;
    this.startedAt = Date.now() / 1000;
    await this.cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  }

  /** Stops dropping old frames: the event is here, keep its run-up. */
  hold() {
    this.keep = Infinity;
  }

  async stop() {
    if (!this.recording) return;
    this.recording = false;
    await this.cdp.send('Page.stopScreencast');
    this.cdp.removeAllListeners('Page.screencastFrame');
    // A page that does not move sends no frames: take one so the moment shows.
    if (this.frames.length === this.momentStart) {
      const { data } = await this.cdp.send('Page.captureScreenshot', { format: 'png' });
      this.save(data, this.startedAt);
    }
    // The last frame lasts until the moment ends: that is how pauses on a
    // still page are kept (the screencast sends nothing while nothing moves).
    const last = this.frames[this.frames.length - 1];
    last.last = true;
    last.lasts = Math.max(1 / 12, Date.now() / 1000 - last.t);
  }

  save(data, t) {
    const file = join(this.dir, `f${String(++this.count).padStart(6, '0')}.png`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    this.frames.push({ file, t });
  }

  onFrame({ data, sessionId, metadata }) {
    if (!this.recording) return;
    this.save(data, metadata.timestamp);
    // A rolling window: forget this moment's frames older than `keep` seconds.
    while (this.frames.length - this.momentStart > 1 && metadata.timestamp - this.frames[this.momentStart].t > this.keep) {
      rmSync(this.frames[this.momentStart].file, { force: true });
      this.frames.splice(this.momentStart, 1);
    }
    this.cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  }

  /** Writes the frames as a lossless 30 fps video and returns its path. */
  toVideo() {
    if (!this.frames.length) throw new Error('Nothing was recorded: call clip.start() and clip.stop() around what the GIF shows.');
    let list = '';
    this.frames.forEach((frame, i) => {
      const next = this.frames[i + 1];
      const duration = !next || frame.last ? frame.lasts ?? 1 / 12 : Math.max(1 / 60, next.t - frame.t);
      list += `file '${frame.file}'\nduration ${duration.toFixed(4)}\n`;
    });
    list += `file '${this.frames[this.frames.length - 1].file}'\n`;
    const listFile = join(this.dir, 'frames.txt');
    writeFileSync(listFile, list);
    const video = join(this.dir, 'clip.mkv');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-r', '30', '-c:v', 'ffv1', video]);
    return video;
  }
}

/** Saves a PNG of the page (or of `locator`), resized when asked ('1280x640'). */
async function savePng(page, name, options = {}, locator = null) {
  const path = join(OUT, `${name}.png`);
  const shotOptions = { path, omitBackground: !!options.omitBackground, fullPage: !!options.fullPage, clip: options.clip };
  if (locator) await locator.screenshot(shotOptions);
  else await page.screenshot(shotOptions);
  if (options.resize) {
    const [w, h] = options.resize.split('x');
    const tmp = `${path}.tmp.png`;
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path, '-vf', `scale=${w}:${h}:flags=lanczos`, tmp]);
    renameSync(tmp, path);
  }
  // Pages full of card photos come out over the 1 MB budget as true-colour
  // PNGs: a 256-colour palette brings them to about half, invisibly at 960 px.
  if (statSync(path).size > 1024 * 1024) {
    const tmp = `${path}.tmp.png`;
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path, '-vf', 'split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a', '-pix_fmt', 'pal8', tmp]);
    renameSync(tmp, path);
  }
  console.log(path);
}

async function newContext(browser, options, session) {
  const context = await browser.newContext({
    viewport: options.viewport ?? DESKTOP,
    deviceScaleFactor: options.scale ?? 1,
    isMobile: !!options.mobile,
    hasTouch: !!options.mobile,
    storageState: session,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    colorScheme: 'dark',
  });
  await context.addCookies([
    { name: 'lang', value: options.lang ?? LANG, url: APP_URL },
    { name: 'theme', value: 'dark', url: APP_URL },
  ]);
  return context;
}

async function capture(browser, name, shot, env) {
  const options = shot.png ?? shot.gif ?? {};
  const context = await newContext(browser, options, env.session);
  const page = await context.newPage();
  page.on('pageerror', (error) => console.warn(`  [${name}] page error: ${error.message}`));
  await setup(page);
  await env.heartbeat(); // the sidebar shows the agent online (a heartbeat under 90 s old)
  const dir = mkdtempSync(join(tmpdir(), `showcase-${name}-`));
  try {
    if (shot.gif) {
      const clip = new Clip(page, dir);
      const still = (stillName, stillOptions = {}, locator = null) => savePng(page, stillName, stillOptions, locator);
      await shot.run({ page, clip, still, env });
      await clip.stop();
      // The crop may depend on the layout: a function of the page is allowed.
      const crop = typeof shot.gif.crop === 'function' ? await shot.gif.crop(page) : shot.gif.crop;
      const args = [MAKE_GIF, clip.toVideo(), join(OUT, `${name}.gif`), '--fps', String(shot.gif.fps ?? 12), '--speed', String(shot.gif.speed ?? 1), '--max-mb', String(shot.gif.maxMb ?? 4)];
      if (crop) args.push('--crop', crop);
      if (shot.gif.pad) args.push('--pad', shot.gif.pad);
      execFileSync(PYTHON, args, { stdio: 'inherit' });
    } else {
      // run() may return a locator to capture just that element.
      const target = await shot.run({ page, env });
      await savePng(page, name, options, target && typeof target.screenshot === 'function' ? target : null);
    }
  } finally {
    await context.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Signs in once with the fixture account; every shot reuses the session. */
async function signIn(browser, user, file) {
  const context = await newContext(browser, {}, undefined);
  const page = await context.newPage();
  await page.goto(url('/login'));
  await page.fill('input[name=email]', user.email);
  await page.fill('input[name=password]', user.password);
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard', { timeout: 120_000 });
  await context.storageState({ path: file });
  await context.close();
  return file;
}

/** True when an app already answers on APP_URL (a previous --keep run). */
async function appRunning() {
  try {
    return (await fetch(url('/login'))).ok;
  } catch {
    return false;
  }
}

const args = process.argv.slice(2);
const serve = args.includes('--serve');
const reuse = args.includes('--reuse');
const keep = serve || reuse || args.includes('--keep');
const wanted = args.filter((a) => !a.startsWith('--'));
mkdirSync(OUT, { recursive: true });
const stack = startStack({ reset: !reuse });
const db = new pg.Client({ connectionString: stack.dbUrl });
await db.connect();
const loaded = reuse && (await db.query('select count(*)::int as n from public.cards')).rows[0].n > 0;
const users = loaded ? fixture('users') : (await seed(stack)).users;
// An app left running by a --keep run is reused; one started here is stopped here.
const stopApp = (await appRunning()) ? async () => {} : await startApp(stack, { vintedUserIds: users.map((u) => u.id) });
if (serve) {
  // No shots: just the seeded app, to click around in.
  await heartbeat(db, users.map((u) => u.id));
  await db.end();
  console.log(`\nThe app is on ${APP_URL}: sign in with an account from fixtures/users.json.`);
  console.log('Ctrl+C stops the app; `node stack.mjs stop` stops the stack and drops its data.');
  await new Promise(() => {});
}
const sessionDir = mkdtempSync(join(tmpdir(), 'showcase-session-'));
// --lang: the browser's own widgets (time inputs) follow the UI language too.
const browser = await chromium.launch({ args: ['--lang=fr-FR'] });
try {
  const env = { stack, users, db, cleanups: [], session: await signIn(browser, users[0], join(sessionDir, 'owner.json')) };
  env.heartbeat = () => heartbeat(db, users.map((u) => u.id));
  for (const [name, shot] of Object.entries(SHOTS)) {
    if (wanted.length && !wanted.includes(name)) continue;
    console.log(`\n▶ ${name}`);
    try {
      await capture(browser, name, shot, env);
    } finally {
      while (env.cleanups.length) await env.cleanups.pop()();
    }
  }
} finally {
  await db.end();
  await browser.close();
  rmSync(sessionDir, { recursive: true, force: true });
  if (!keep) {
    await stopApp();
    stopStack();
  } else {
    console.log(`
Still running: the app on ${APP_URL} (Ctrl+C stops it), the stack until \`node stack.mjs stop\`.`);
  }
}
