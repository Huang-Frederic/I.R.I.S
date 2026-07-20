import type { Extractor, StoreEvent } from '../types';
import { fetchJson } from '../lib/http';
import { parseFrenchDate } from '../lib/parse-french-date';
import { classifyEventType } from '../lib/classify';

/**
 * Loufoque — Shopify. Events are modelled as products in a collection, so the
 * `/collections/<handle>/products.json` feed gives us everything cleanly (no
 * HTML scraping). The event date lives in the French product title.
 */
interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  variants?: Array<{ price?: string }>;
}

export const loufoque: Extractor = async (meta) => {
  const origin = new URL(meta.url).origin;
  const collection = new URL(meta.url).pathname.replace(/\/+$/, '');
  const { products } = await fetchJson<{ products: ShopifyProduct[] }>(
    `${origin}${collection}/products.json?limit=250`,
  );

  return products.map((p): StoreEvent => {
    const priceStr = p.variants?.[0]?.price;
    return {
      source: meta.id,
      shopName: meta.name,
      city: meta.city,
      title: p.title,
      eventType: classifyEventType(p.title),
      startsAt: parseFrenchDate(p.title),
      url: `${origin}/products/${p.handle}`,
      price: priceStr != null && priceStr !== '' ? Number(priceStr) : null,
      externalId: `${meta.id}:${p.id}`,
    };
  });
};
