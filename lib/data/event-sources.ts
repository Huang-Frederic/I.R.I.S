/**
 * THE SHOP DIRECTORY — the single source of truth for which shops IRIS follows.
 *
 * Consumed by BOTH:
 *   - the scraper list (scripts/store-events/sources.ts) — attaches an extractor
 *     to each shop that has one, keyed by `id`.
 *   - the /events legend (components/events/ShopLegend.tsx) — lists every shop
 *     with a link to its events page.
 *
 * App-safe: pure data, no scraper/node imports. Adding a shop to the legend =
 * one entry here; making it scraped = add its extractor in sources.ts.
 */
export interface EventSourceInfo {
  /** Stable slug — matches StoreEvent.source + the extractor key. */
  id: string;
  name: string;
  /** Empty string when not confidently known yet (legend hides it). */
  city: string;
  /** The shop's public events page — where the legend links, and where a
   *  server-fetch extractor scrapes from. */
  eventsUrl: string;
  /** True once a live extractor feeds this shop into store_events. */
  scraped: boolean;
  /** Distinct color for this shop — the calendar pins + legend swatch. Hex so
   *  it survives Tailwind purge (inline style, not a dynamic class). */
  color: string;
}

export const EVENT_SOURCES: EventSourceInfo[] = [
  {
    id: 'loufoque',
    name: 'Boutique Loufoque',
    city: 'Paris',
    eventsUrl: 'https://shop.loufoque.fr/collections/tournois-pokemon',
    scraped: true,
    color: '#38bdf8', // sky
  },
  {
    id: 'gentlemen',
    name: 'Les Gentlemen du Jeu',
    city: 'Paris',
    eventsUrl: 'https://lesgentlemendujeu.com/104-evenements-pokemon',
    scraped: true,
    color: '#34d399', // emerald
  },
  {
    id: 'playin-bnf',
    name: 'Playin Paris BNF',
    city: 'Paris',
    eventsUrl: 'https://www.play-in.com/fr/evenements/1/paris-bnf?category=12',
    scraped: true,
    color: '#fbbf24', // amber
  },
  {
    id: 'playin-rivoli',
    name: 'Playin Paris Rivoli',
    city: 'Paris',
    eventsUrl: 'https://www.play-in.com/fr/evenements/3/paris-rivoli?category=12',
    scraped: true,
    color: '#fb923c', // orange
  },
  {
    id: 'troll2jeux',
    name: 'Troll2Jeux',
    city: '',
    eventsUrl: 'https://troll2jeux.com/calendrier?category=10002446',
    scraped: true,
    color: '#a78bfa', // violet
  },
  {
    id: 'parkage',
    name: 'Paris EDB', // the shop behind the Parkage link (shop_id=6)
    city: 'Paris',
    eventsUrl: 'https://www.parkage.com/en/tournaments-and-events?shop_id=6&category_id=4',
    scraped: true,
    color: '#f472b6', // pink
  },
  {
    id: 'cafemeisia',
    name: 'Café Meisia',
    city: 'Paris',
    eventsUrl: 'https://shop.cafemeisia.com/events/',
    scraped: false,
    color: '#2dd4bf', // teal
  },
  {
    id: 'coin-des-barons',
    name: 'Le Coin des Barons',
    city: 'Paris',
    // Manual source: their planning is a monthly Instagram poster, so the link
    // is their Instagram (per Fred's request). Events are transcribed by hand
    // in extractors/coin-des-barons.ts when a new poster is provided.
    eventsUrl: 'https://www.instagram.com/lecoindesbaronstcg/',
    scraped: true,
    color: '#818cf8', // indigo
  },
];

/** id → hex color, for the calendar pins and legend swatches. */
export const SHOP_COLORS: Record<string, string> = Object.fromEntries(
  EVENT_SOURCES.map((s) => [s.id, s.color]),
);

export function eventSourceById(id: string): EventSourceInfo | undefined {
  return EVENT_SOURCES.find((s) => s.id === id);
}
