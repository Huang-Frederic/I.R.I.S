import type { CardGroup } from './group-cards';
import { isListingStale } from './listing-stale';

/**
 * Sort Vinted groups in 3 buckets, mirroring how the user thinks about their
 * sales pipeline:
 *
 *   1. PAS EN LIGNE — vinted_listed_at === null
 *      Ordered by date_added ASC (oldest first = next to be uploaded).
 *
 *   2. À RAFRAÎCHIR — listed for MORE than 21 days
 *      Ordered by vinted_listed_at ASC (the staler, the higher — needs
 *      attention first).
 *
 *   3. EN LIGNE FRAIS — listed within the last 21 days
 *      Ordered by vinted_listed_at DESC (most recent listing first).
 *
 * Sold rows are handled separately by VintedList — they sit below the for_sale
 * pile, sorted by date_sold DESC.
 *
 * Pure function — returns a new array, does not mutate input.
 */
export function sortVintedGroups(groups: CardGroup[], now: number = Date.now()): CardGroup[] {
  const bucketOf = (g: CardGroup): 0 | 1 | 2 => {
    const listed = g.head.vinted_listed_at;
    if (listed === null) return 0;
    return isListingStale(listed, now) ? 1 : 2;
  };

  return [...groups].sort((a, b) => {
    const ba = bucketOf(a);
    const bb = bucketOf(b);
    if (ba !== bb) return ba - bb;

    if (ba === 0) {
      // Both offline — oldest date_added first.
      return a.head.date_added.localeCompare(b.head.date_added);
    }
    if (ba === 1) {
      // Both stale — oldest listing first (most overdue at top).
      return (a.head.vinted_listed_at ?? '').localeCompare(b.head.vinted_listed_at ?? '');
    }
    // Both fresh — newest listing first.
    return (b.head.vinted_listed_at ?? '').localeCompare(a.head.vinted_listed_at ?? '');
  });
}
