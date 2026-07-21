/**
 * THE LIST — the shops that actually get scraped, each paired with its extractor.
 *
 * Shop display info (name, city, events URL) lives in the shared directory
 * lib/data/event-sources.ts. Here we only wire the extractors:
 *
 *   Adding a shop = (1) create extractors/<shop>.ts, (2) add its id → extractor
 *   below (and set scraped:true for it in lib/data/event-sources.ts).
 *
 * `needsBrowser: true` marks a JS-rendered site — the GitHub Action skips it
 * (--no-browser); it runs on the WSL box with the Vinted agent.
 *
 * You never touch core.ts, types.ts, or the other extractors.
 */
import { EVENT_SOURCES } from '../../lib/data/event-sources';
import type { Extractor, Source } from './types';
import { loufoque } from './extractors/loufoque';
import { gentlemen } from './extractors/gentlemen';
import { playin } from './extractors/playin';
import { parkage } from './extractors/parkage';
import { troll2jeux } from './extractors/troll2jeux';
import { coinDesBarons } from './extractors/coin-des-barons';

/** id → its extractor (+ whether it needs a browser). Only shops listed here are scraped. */
const EXTRACTORS: Record<string, { fn: Extractor; needsBrowser?: boolean }> = {
  loufoque: { fn: loufoque },
  gentlemen: { fn: gentlemen },
  'playin-bnf': { fn: playin, needsBrowser: true },
  'playin-rivoli': { fn: playin, needsBrowser: true },
  parkage: { fn: parkage, needsBrowser: true },
  troll2jeux: { fn: troll2jeux, needsBrowser: true },
  'coin-des-barons': { fn: coinDesBarons }, // manual (Instagram poster)
};

export const SOURCES: Source[] = EVENT_SOURCES.filter((s) => s.id in EXTRACTORS).map((s) => ({
  id: s.id,
  name: s.name,
  city: s.city,
  url: s.eventsUrl,
  extract: EXTRACTORS[s.id].fn,
  needsBrowser: EXTRACTORS[s.id].needsBrowser,
}));
