import type { CardGroup } from './group-cards';
import type { BaseListing } from '@/lib/types';
import { isListingStale } from './listing-stale';
import { getMyListing } from './listings';

/**
 * Sort Vinted groups in 3 buckets, mirroring how the user thinks about their
 * sales pipeline:
 *
 *   1. PAS EN LIGNE — user has no listing
 *      Ordered by date_added ASC (oldest first = next to be uploaded).
 *
 *   2. À RAFRAÎCHIR — listed for MORE than 21 days
 *      Ordered by listing.listed_at ASC (the staler, the higher — needs
 *      attention first).
 *
 *   3. EN LIGNE FRAIS — listed within the last 21 days
 *      Ordered by listing.listed_at DESC (most recent listing first).
 *
 * Sold rows are handled separately by VintedList — they sit below the for_sale
 * pile, sorted by date_sold DESC.
 *
 * Pure function — returns a new array, does not mutate input.
 */
export function sortVintedGroups<T extends CardGroup & { head: CardGroup['head'] & { listings: BaseListing[] } }>(
  groups: T[],
  now: number,
  myUserId: string,
  direction: 'asc' | 'desc' = 'asc',
): T[] {
  const bucketOf = (g: T): 0 | 1 | 2 => {
    const myListing = getMyListing(g.head.listings, myUserId);
    if (!myListing) return 0;
    return isListingStale(myListing.listed_at, now) ? 1 : 2;
  };

  return [...groups].sort((a, b) => {
    const ba = bucketOf(a);
    const bb = bucketOf(b);
    if (ba !== bb) return ba - bb;

    if (ba === 0) {
      // Both offline — sort by date_added, direction-controlled.
      const cmp = a.head.date_added.localeCompare(b.head.date_added);
      return direction === 'desc' ? -cmp : cmp;
    }
    const myListingA = getMyListing(a.head.listings, myUserId);
    const myListingB = getMyListing(b.head.listings, myUserId);
    if (ba === 1) {
      // Both stale — oldest listing first (most overdue at top).
      return (myListingA?.listed_at ?? '').localeCompare(myListingB?.listed_at ?? '');
    }
    // Both fresh — newest listing first.
    return (myListingB?.listed_at ?? '').localeCompare(myListingA?.listed_at ?? '');
  });
}
