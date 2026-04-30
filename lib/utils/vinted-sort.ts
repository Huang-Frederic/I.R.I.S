import type { CardGroup } from './group-cards';

/**
 * Sort Vinted groups so that:
 *   - groups whose head card is NOT yet listed on Vinted (vinted_listed_at === null)
 *     come first, ordered by date_added ASC (oldest first = next to be listed)
 *   - groups whose head card IS listed (vinted_listed_at !== null) come after,
 *     ordered by vinted_listed_at DESC (most recently listed first)
 *
 * Pure function — returns a new array.
 */
export function sortVintedGroups(groups: CardGroup[]): CardGroup[] {
  return [...groups].sort((a, b) => {
    const aListed = a.head.vinted_listed_at !== null;
    const bListed = b.head.vinted_listed_at !== null;
    if (!aListed && bListed) return -1;
    if (aListed && !bListed) return 1;
    if (!aListed && !bListed) {
      return a.head.date_added.localeCompare(b.head.date_added);
    }
    // Both listed — newest first
    return (b.head.vinted_listed_at ?? '').localeCompare(a.head.vinted_listed_at ?? '');
  });
}
