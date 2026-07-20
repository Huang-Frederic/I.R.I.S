/**
 * Shared shape for the store-events scraper. Every extractor — whatever its
 * site's quirks — returns StoreEvent[] in this exact shape, so the core engine,
 * the DB, and the IRIS page never care where an event came from.
 *
 * Adding a shop = one new file in extractors/ + one line in sources.ts.
 * This file and core.ts are NEVER touched when adding a shop.
 */

export type EventType =
  | 'league' // Session de ligue / jeu libre
  | 'tournament' // Tournoi (standard/étendu, circuit…)
  | 'prerelease' // Avant-première d'un nouveau set
  | 'league_cup' // League Cup officielle
  | 'league_challenge'; // League Challenge officielle

export interface StoreEvent {
  /** Extractor id — also the shop key. Matches SourceMeta.id. */
  source: string;
  shopName: string;
  city: string;
  /** Raw human title (carries the human-readable date as printed by the shop). */
  title: string;
  eventType: EventType | null;
  /** ISO UTC timestamp, or null when the date couldn't be parsed. */
  startsAt: string | null;
  /** Deep link to the event / registration page. */
  url: string;
  price: number | null;
  /** Stable per-event id (`${source}:${nativeId}`) — the upsert dedup key. */
  externalId: string;
}

/** The static info the list (sources.ts) holds for each shop. */
export interface SourceMeta {
  /** Stable slug — used as StoreEvent.source, the externalId prefix, and the filename. */
  id: string;
  name: string;
  city: string;
  /** The events page the extractor reads. */
  url: string;
}

/** A shop's scraping rule: take its meta, return normalized events. */
export type Extractor = (meta: SourceMeta) => Promise<StoreEvent[]>;

/** One entry in the list: a shop's info + its associated extractor. */
export interface Source extends SourceMeta {
  extract: Extractor;
}
