/**
 * THE LIST — the shops that actually get scraped, each paired with its extractor.
 *
 * Shop display info (name, city, events URL) lives in the shared directory
 * lib/data/event-sources.ts. Here we only wire the extractors:
 *
 *   Adding a shop = (1) create extractors/<shop>.ts, (2) add its id → extractor
 *   below (and set scraped:true for it in lib/data/event-sources.ts).
 *
 * You never touch core.ts, types.ts, or the other extractors.
 */
import { EVENT_SOURCES } from '../../lib/data/event-sources';
import type { Extractor, Source } from './types';
import { loufoque } from './extractors/loufoque';
import { gentlemen } from './extractors/gentlemen';

/** id → its extractor. Only shops listed here are scraped. */
const EXTRACTORS: Record<string, Extractor> = {
  loufoque,
  gentlemen,
};

export const SOURCES: Source[] = EVENT_SOURCES.filter((s) => s.id in EXTRACTORS).map((s) => ({
  id: s.id,
  name: s.name,
  city: s.city,
  url: s.eventsUrl,
  extract: EXTRACTORS[s.id],
}));
