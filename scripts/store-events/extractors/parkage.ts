import type { Extractor, StoreEvent } from '../types';
import { withPage } from '../lib/browser';
import { parseParkageEvents, parseParkagePrice } from '../lib/parse-parkage';
import { classifyEventType } from '../lib/classify';

/** Build an ISO UTC from parts, inferring the year (events are upcoming). */
function isoFromParts(month: number, day: number, hh: number, mm: number, refNow = new Date()): string {
  let year = refNow.getUTCFullYear();
  const candidate = Date.UTC(year, month - 1, day, hh, mm);
  if (candidate < refNow.getTime() - 60 * 24 * 60 * 60 * 1000) year += 1;
  return new Date(Date.UTC(year, month - 1, day, hh, mm)).toISOString();
}

/**
 * Parkage (Paris EDB) — Next.js/RSC tournament platform. No clean client API,
 * so we render the page and parse the stable visible-text sequence (English
 * date headers → time → name → price). The page URL is already filtered to
 * Pokémon (category_id=4).
 */
export const parkage: Extractor = async (meta) => {
  const lines = await withPage(async (page) => {
    await page.goto(meta.url, { waitUntil: 'networkidle', timeout: 30000 });
    await page
      .waitForFunction(() => /\d{1,2}:\d{2}/.test(document.body.innerText), { timeout: 20000 })
      .catch(() => {});
    return page.evaluate(() => {
      const main = document.querySelector('main') ?? document.body;
      return main.innerText.split('\n').map((s) => s.trim()).filter(Boolean);
    });
  });

  return parseParkageEvents(lines).map((r): StoreEvent => {
    const startsAt = isoFromParts(r.month, r.day, r.hh, r.mm);
    const slug = r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return {
      source: meta.id,
      shopName: meta.name,
      city: meta.city,
      title: r.name,
      eventType: classifyEventType(r.name),
      startsAt,
      spotsLeft: r.spotsLeft,
      url: meta.url,
      price: parseParkagePrice(r.priceText),
      externalId: `${meta.id}:${startsAt.slice(0, 10)}-${r.hh}${r.mm}-${slug}`,
    };
  });
};
