/**
 * Shared test fixtures. Replaces the per-file `makeCard` / `makeGroup` /
 * `makeInput` helpers that were duplicated across 7+ test files.
 *
 * Defaults are intentionally generic (Pikachu, EN, NM, Common, for_sale) —
 * tests should override only the fields they actually depend on, which makes
 * the test's intent obvious from the call site.
 *
 * Usage:
 *   import { makeCard, makeGroup } from '@/lib/utils/test-fixtures';
 *
 *   const card = makeCard({ status: 'pokedex', pokemon_number: 6 });
 *   const group = makeGroup(card);
 */

import type { Card, CardListing, CardWithListings } from '@/lib/types';
import type { CardGroup } from './group-cards';

/** Test-only narrowing of CardGroup whose head/cards are CardWithListings.
 *  Mirrors the local alias previously defined in vinted-sort.test.ts. */
export type CardGroupWithListings = Omit<CardGroup, 'head' | 'cards'> & {
  cards: CardWithListings[];
  head: CardWithListings;
};

const CARD_DEFAULTS: Card = {
  id: 'test-card-id',
  pokemon_name: 'Pikachu',
  pokemon_number: 25,
  card_name: 'Pikachu',
  card_id_tcg: 'sv1-100',
  set_name: 'Scarlet & Violet',
  set_code: 'sv1',
  set_number: '100',
  language: 'EN',
  rarity: 'C',
  rarity_rank: 1,
  condition: 'NM',
  status: 'for_sale',
  image_url: null,
  tcg_image_url: null,
  cardmarket_id: null,
  cardmarket_url: null,
  cm_price_low: null,
  cm_price_trend: null,
  cm_price_avg: null,
  suggested_price: null,
  cm_updated_at: null,
  lot_id: null,
  date_added: '2026-01-01T00:00:00Z',
  date_sold: null,
  sold_price: null,
  sold_by_user_id: null,
  notes: null,
  variant: null,
};

/** Build a Card with sensible defaults; pass overrides for the fields under test. */
export function makeCard(overrides: Partial<Card> = {}): Card {
  return { ...CARD_DEFAULTS, ...overrides };
}

/** Same as makeCard but adds an empty `listings` array (for vinted-sort/filter tests). */
export function makeCardWithListings(
  overrides: Partial<CardWithListings> = {},
): CardWithListings {
  return { ...CARD_DEFAULTS, listings: [], ...overrides };
}

/** Build a CardListing — used to test per-user "listed on Vinted" logic. */
export function makeListing(overrides: Partial<CardListing> = {}): CardListing {
  return {
    card_id: 'test-card-id',
    user_id: 'test-user-id',
    listed_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

/** Wrap a card in a single-element CardGroupWithListings (Vinted pile structure). */
export function makeGroup(
  card: CardWithListings,
  position = 1,
): CardGroupWithListings {
  return {
    key: `${card.id}-key`,
    cards: [card],
    head: card,
    count: 1,
    position,
  };
}
