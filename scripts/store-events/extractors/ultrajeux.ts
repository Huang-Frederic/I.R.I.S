import type { Extractor, StoreEvent } from '../types';
import { withPage } from '../lib/browser';
import { parseFrenchDate } from '../lib/parse-french-date';
import { classifyEventType } from '../lib/classify';

/**
 * UltraJeux — the events category page renders its `block_produit` list
 * client-side (a plain `fetch` of the URL returns none of it), so this needs
 * a real browser. Each event is `<a href="produit-33040-…-0000000000000.html"
 * …><b>Défi de Ligue Pokémon - Samedi 28 Novembre à 10h - Oberkampf</b></a>` —
 * the date/location live in the link text; the PrestaShop-style product id in
 * the URL (".../produit-33040-...") is the stable external id.
 */
const EVENT_LINK = /<a href="(produit-(\d+)-[^"]+)"[^>]*>\s*<b>([^<]+)<\/b>/g;

export const ultrajeux: Extractor = async (meta) => {
  const html = await withPage(async (page) => {
    await page.goto(meta.url, { waitUntil: 'networkidle', timeout: 30000 });
    return page.content();
  });

  const events: StoreEvent[] = [];
  for (const match of html.matchAll(EVENT_LINK)) {
    const url = new URL(match[1], meta.url).toString();
    const productId = match[2];
    const name = match[3].trim();
    if (!name) continue;
    events.push({
      source: meta.id,
      shopName: meta.name,
      city: meta.city,
      title: name,
      eventType: classifyEventType(name),
      startsAt: parseFrenchDate(name),
      url,
      price: null,
      externalId: `${meta.id}:${productId}`,
    });
  }

  return events;
};
