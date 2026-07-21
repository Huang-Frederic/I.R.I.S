import type { Extractor, StoreEvent } from '../types';
import { withPage } from '../lib/browser';
import { parsePlayinEvents, parsePlayinPrice } from '../lib/parse-playin';
import { parseFrenchDate } from '../lib/parse-french-date';
import { classifyEventType } from '../lib/classify';

/**
 * Play-in (Paris BNF + Rivoli — same code, different meta.url). PandaCSS/RSC
 * app with no stable selectors, so we render the page in a browser and parse
 * the stable visible-text sequence (see parse-playin.ts). The per-event detail
 * links (/fr/evenement/{id}/…), captured in DOM order, give real deep links +
 * stable ids; we zip them with the parsed events by index.
 */
export const playin: Extractor = async (meta) => {
  const origin = new URL(meta.url).origin;
  const { lines, hrefs } = await withPage(async (page) => {
    await page.goto(meta.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('a[href*="/fr/evenement/"]', { timeout: 20000 });
    return page.evaluate(() => {
      const main = document.querySelector('main') ?? document.body;
      const startAt = main.innerText.search(/(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)/i);
      const text = startAt >= 0 ? main.innerText.slice(startAt) : main.innerText;
      return {
        lines: text.split('\n').map((s) => s.trim()).filter(Boolean),
        hrefs: [...document.querySelectorAll('a[href*="/fr/evenement/"]')].map((a) => a.getAttribute('href') ?? ''),
      };
    });
  });

  const raw = parsePlayinEvents(lines);

  return raw.map((r, i): StoreEvent => {
    // Strip a leading icon/emoji/symbol run the theme prepends to some names.
    const title = r.name.replace(/^[^\p{L}\p{N}]+/u, '').trim();
    // Reuse the tested FR date parser: feed it "date à HHhMM" so it gets both.
    const startsAt = parseFrenchDate(`${r.dateHeader} à ${r.hh}h${String(r.mm).padStart(2, '0')}`);
    // End time (same day): reuse the parsed start day, swap the hours/minutes.
    const endsAt =
      startsAt && r.endHh != null
        ? new Date(new Date(startsAt).setUTCHours(r.endHh, r.endMm ?? 0, 0, 0)).toISOString()
        : null;
    const href = hrefs[i] ?? '';
    const idMatch = href.match(/\/evenement\/(\d+)/);
    const nativeId = idMatch ? idMatch[1] : `${startsAt ?? r.dateHeader}-${r.hh}${r.mm}-${title.slice(0, 24)}`;
    return {
      source: meta.id,
      shopName: meta.name,
      city: meta.city,
      title,
      eventType: classifyEventType(title),
      startsAt,
      endsAt,
      url: href ? `${origin}${href}` : meta.url,
      price: parsePlayinPrice(r.priceText),
      externalId: `${meta.id}:${nativeId}`,
    };
  });
};
