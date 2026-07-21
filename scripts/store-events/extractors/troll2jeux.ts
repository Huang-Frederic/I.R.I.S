import type { Extractor, StoreEvent } from '../types';
import { withPage } from '../lib/browser';
import { parseTroll2jeuxHeader, parseTroll2jeuxEvents } from '../lib/parse-troll2jeux';
import { classifyEventType } from '../lib/classify';

/**
 * Troll2Jeux — PrestaShop with a JS-rendered monthly calendar (no data in the
 * static HTML). We render the page and parse the visible grid: the header gives
 * the month/year, each day cell carries "HH:MM | Event name" lines. The URL is
 * filtered to the Pokémon category.
 */
export const troll2jeux: Extractor = async (meta) => {
  const { header, gridLines } = await withPage(async (page) => {
    await page.goto(meta.url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForFunction(() => /Lundi\s+Mardi/i.test(document.body.innerText), { timeout: 20000 }).catch(() => {});
    return page.evaluate(() => {
      const main = document.querySelector('main') ?? document.body;
      const txt = main.innerText;
      const h = txt.match(/\d{4}\s+(Janvier|Février|Mars|Avril|Mai|Juin|Juillet|Août|Septembre|Octobre|Novembre|Décembre)/i);
      const start = txt.search(/Lundi\s+Mardi\s+Mercredi/i);
      const end = txt.search(/COORDONN[ÉE]ES/i);
      const grid = txt.slice(start, end > 0 ? end : undefined);
      return {
        header: h ? h[0] : '',
        gridLines: grid.split(/[\n\t]/).map((s) => s.trim()).filter(Boolean),
      };
    });
  });

  const ym = parseTroll2jeuxHeader(header);
  if (!ym) return [];

  return parseTroll2jeuxEvents(gridLines).map((r): StoreEvent => {
    const startsAt = new Date(Date.UTC(ym.year, ym.month - 1, r.day, r.hh, r.mm)).toISOString();
    const slug = r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return {
      source: meta.id,
      shopName: meta.name,
      city: meta.city,
      title: r.name,
      eventType: classifyEventType(r.name),
      startsAt,
      url: meta.url,
      price: null,
      externalId: `${meta.id}:${startsAt.slice(0, 10)}-${r.hh}${r.mm}-${slug}`,
    };
  });
};
