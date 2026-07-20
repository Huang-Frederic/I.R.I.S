import type { Extractor, StoreEvent } from '../types';
import { fetchText } from '../lib/http';
import { parseFrenchDate } from '../lib/parse-french-date';
import { classifyEventType } from '../lib/classify';

/**
 * Les Gentlemen du Jeu — PrestaShop. Its rule: request the category with
 * `resultsPerPage=99999` — the default URL serves a faceted-search AJAX page
 * (products escaped inside a JSON blob), whereas this forces the full
 * server-rendered page that carries a clean JSON-LD ItemList (name + url per
 * event). The event date lives in the French event name; the PrestaShop
 * product id in the URL (".../12278-...") is the stable external id.
 */
interface ItemListLd {
  '@type'?: string;
  itemListElement?: Array<{ name?: string; url?: string }>;
}

const LD_BLOCK = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;

export const gentlemen: Extractor = async (meta) => {
  const full = new URL(meta.url);
  full.searchParams.set('resultsPerPage', '99999');
  const html = await fetchText(full.toString());
  const events: StoreEvent[] = [];

  for (const match of html.matchAll(LD_BLOCK)) {
    let data: ItemListLd;
    try {
      data = JSON.parse(match[1].trim()) as ItemListLd;
    } catch {
      continue;
    }
    if (data['@type'] !== 'ItemList' || !Array.isArray(data.itemListElement)) continue;

    for (const item of data.itemListElement) {
      const name = item.name?.trim();
      const url = item.url?.trim();
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
  }

  return events;
};
