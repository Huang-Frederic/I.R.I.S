import type { CardWithListings, LotWithListings, OtherItemWithListings, BaseListing } from '@/lib/types';
import type { CardGroup } from './group-cards';
import { isListingStale } from './listing-stale';
import { getMyListing } from './listings';

/** CardGroup whose head/cards are CardWithListings (mirrors VintedList's local alias). */
export type CardGroupWithListings = Omit<CardGroup, 'head' | 'cards'> & {
  head: CardWithListings;
  cards: CardWithListings[];
};

/** Discriminated union — each row in the interleaved output is a card group, a lot, or an other_item. */
export type MixedRow =
  | { kind: 'card'; group: CardGroupWithListings }
  | { kind: 'lot'; lot: LotWithListings }
  | { kind: 'other_item'; item: OtherItemWithListings };

type Bucket = 0 | 1 | 2;

function bucketOf(listings: BaseListing[], now: number, myUserId: string): Bucket {
  const mine = getMyListing(listings, myUserId);
  if (!mine) return 0;
  // Listing row exists but ID is null (lost after failed repost) → treat as fresh.
  // Mirrors passesStateChips: these items are "En ligne", not "Pas en ligne".
  if (!mine.vinted_listing_id) return 2;
  return isListingStale(mine.vinted_posted_at, now) ? 1 : 2;
}

/**
 * Mix a list of card groups and lots into a single render order.
 *
 * Bucket order matches `sortVintedGroups`:
 *   0 — offline (no listing of mine)
 *   1 — stale (listing > 21d)
 *   2 — fresh (listing <= 21d)
 *
 * Within each bucket:
 *   0 → date_added ASC (oldest first — what's next to publish)
 *   1 → listing.listed_at ASC (most overdue first)
 *   2 → listing.listed_at DESC (most recent listing first)
 *
 * Cards, lots and other_items interleave naturally: they share the bucket
 * logic, so the "All" tab on /vinted reads chronologically instead of
 * grouped by kind.
 *
 * `items` trails the signature (defaulting to `[]`) so existing cards/lots
 * call sites don't need updating.
 *
 * Pure function — does not mutate inputs.
 */
export function interleaveCardsAndLots(
  groups: CardGroupWithListings[],
  lots: LotWithListings[],
  now: number,
  myUserId: string,
  direction: 'asc' | 'desc' = 'asc',
  items: OtherItemWithListings[] = [],
): MixedRow[] {
  const rows: MixedRow[] = [
    ...groups.map((group): MixedRow => ({ kind: 'card', group })),
    ...lots.map((lot): MixedRow => ({ kind: 'lot', lot })),
    ...items.map((item): MixedRow => ({ kind: 'other_item', item })),
  ];

  const listingsOf = (row: MixedRow): BaseListing[] => {
    if (row.kind === 'card') return row.group.head.listings;
    if (row.kind === 'lot') return row.lot.listings;
    return row.item.listings;
  };

  const dateAddedOf = (row: MixedRow): string => {
    if (row.kind === 'card') return row.group.head.date_added;
    if (row.kind === 'lot') return row.lot.date_added;
    return row.item.date_added;
  };

  const listedAtOf = (row: MixedRow): string => {
    const mine = getMyListing(listingsOf(row), myUserId);
    return mine?.vinted_posted_at ?? '';
  };

  const bucketRow = (row: MixedRow): Bucket => bucketOf(listingsOf(row), now, myUserId);

  return rows.sort((a, b) => {
    const ba = bucketRow(a);
    const bb = bucketRow(b);
    if (ba !== bb) return ba - bb;

    if (ba === 0) {
      const cmp = dateAddedOf(a).localeCompare(dateAddedOf(b));
      return direction === 'desc' ? -cmp : cmp;
    }
    if (ba === 1) {
      // Bucket 1 (stale): most overdue first (ASC) by default, reversed by direction.
      const cmp = listedAtOf(a).localeCompare(listedAtOf(b));
      return direction === 'desc' ? -cmp : cmp;
    }
    // Bucket 2 (fresh): most recently listed first (DESC) by default, reversed by direction.
    const cmp = listedAtOf(a).localeCompare(listedAtOf(b));
    return direction === 'asc' ? -cmp : cmp;
  });
}
