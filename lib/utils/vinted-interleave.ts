import type { CardWithListings, LotWithListings, BaseListing } from '@/lib/types';
import type { CardGroup } from './group-cards';
import { isListingStale } from './listing-stale';
import { getMyListing } from './listings';

/** CardGroup whose head/cards are CardWithListings (mirrors VintedList's local alias). */
export type CardGroupWithListings = Omit<CardGroup, 'head' | 'cards'> & {
  head: CardWithListings;
  cards: CardWithListings[];
};

/** Discriminated union — each row in the interleaved output is either a card group or a lot. */
export type MixedRow =
  | { kind: 'card'; group: CardGroupWithListings }
  | { kind: 'lot'; lot: LotWithListings };

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
 * Cards and lots interleave naturally: they share the bucket logic, so the
 * "All" tab on /vinted reads chronologically instead of cards-then-lots.
 *
 * Pure function — does not mutate inputs.
 */
export function interleaveCardsAndLots(
  groups: CardGroupWithListings[],
  lots: LotWithListings[],
  now: number,
  myUserId: string,
  direction: 'asc' | 'desc' = 'asc',
): MixedRow[] {
  const rows: MixedRow[] = [
    ...groups.map((group): MixedRow => ({ kind: 'card', group })),
    ...lots.map((lot): MixedRow => ({ kind: 'lot', lot })),
  ];

  const dateAddedOf = (row: MixedRow): string =>
    row.kind === 'card' ? row.group.head.date_added : row.lot.date_added;

  const listedAtOf = (row: MixedRow): string => {
    const mine = row.kind === 'card'
      ? getMyListing(row.group.head.listings, myUserId)
      : getMyListing(row.lot.listings, myUserId);
    return mine?.vinted_posted_at ?? '';
  };

  const bucketRow = (row: MixedRow): Bucket => {
    if (row.kind === 'card') {
      return bucketOf(row.group.head.listings, now, myUserId);
    }
    return bucketOf(row.lot.listings, now, myUserId);
  };

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
