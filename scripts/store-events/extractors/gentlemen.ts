import type { Extractor, StoreEvent } from '../types';
import { fetchText } from '../lib/http';
import { parseFrenchDate } from '../lib/parse-french-date';
import { classifyEventType } from '../lib/classify';

/**
 * Les Gentlemen du Jeu — PrestaShop. The `resultsPerPage=99999` trick this
 * extractor used to force (to reach a server-rendered JSON-LD ItemList) now
 * gets Cloudflare-blocked (HTTP 403), and the theme has since dropped that
 * JSON-LD block entirely anyway — the plain category page (HTTP 200) now
 * carries the events as ordinary product-title links instead:
 * `<h2 class="h3 product-title"><a href="…/12549-…-dimanche-30-aout-a-14h.html">
 * Pokémon : Célébration des Worlds - Tournoi Amical - Dimanche 30 Août à 14h</a></h2>`.
 * The event date lives in the French link text; the PrestaShop product id in
 * the URL (".../12278-...") is the stable external id.
 */
const PRODUCT_TITLE = /<h2 class="h3 product-title">\s*<a href="([^"]+)">([^<]+)<\/a>/g;

export const gentlemen: Extractor = async (meta) => {
  const html = await fetchText(meta.url);
  const events: StoreEvent[] = [];

  for (const match of html.matchAll(PRODUCT_TITLE)) {
    const url = match[1].trim();
    const name = match[2].trim();
    if (!name || !url) continue;
    const idMatch = url.match(/\/(\d+)-/);
    events.push({
      source: meta.id,
      shopName: meta.name,
      city: meta.city,
      title: name,
      eventType: classifyEventType(name),
      startsAt: parseFrenchDate(name),
      url,
      price: null,
      externalId: `${meta.id}:${idMatch ? idMatch[1] : name}`,
    });
  }

  return events;
};
