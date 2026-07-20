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
}

export const EVENT_SOURCES: EventSourceInfo[] = [
  {
    id: 'loufoque',
    name: 'Boutique Loufoque',
    city: 'Paris',
    eventsUrl: 'https://shop.loufoque.fr/collections/tournois-pokemon',
    scraped: true,
  },
  {
    id: 'gentlemen',
    name: 'Les Gentlemen du Jeu',
    city: 'Paris',
    eventsUrl: 'https://lesgentlemendujeu.com/104-evenements-pokemon',
    scraped: true,
  },
  {
    id: 'playin-bnf',
    name: 'Playin Paris BNF',
    city: 'Paris',
    eventsUrl: 'https://www.play-in.com/fr/evenements/1/paris-bnf?category=12',
    scraped: false,
  },
  {
    id: 'playin-rivoli',
    name: 'Playin Paris Rivoli',
    city: 'Paris',
    eventsUrl: 'https://www.play-in.com/fr/evenements/3/paris-rivoli?category=12',
    scraped: false,
  },
  {
    id: 'troll2jeux',
    name: 'Troll2Jeux',
    city: '',
    eventsUrl: 'https://troll2jeux.com/calendrier?category=10002446',
    scraped: false,
  },
  {
    id: 'parkage',
    name: 'Parkage',
    city: '',
    eventsUrl: 'https://www.parkage.com/en/tournaments-and-events?shop_id=6&category_id=4',
    scraped: false,
  },
  {
    id: 'cafemeisia',
    name: 'Café Meisia',
    city: 'Paris',
    eventsUrl: 'https://shop.cafemeisia.com/events/',
    scraped: false,
  },
];

export function eventSourceById(id: string): EventSourceInfo | undefined {
  return EVENT_SOURCES.find((s) => s.id === id);
}
