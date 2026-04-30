/**
 * Vinted state-chip filter logic. Pure, tested, shared.
 *
 * The four chips (En ligne / Pas en ligne / À rafraîchir / Vendus) are
 * cumulative: a card passes when ANY active chip would include it.
 *
 *   - showOnline  → any card with vinted_listed_at != null (any age)
 *   - showOffline → vinted_listed_at == null
 *   - showStale   → listed > 21 days (a SUBSET of online)
 *   - showSold    → status = sold (independent — handled separately)
 *
 * Edge cases:
 *   - All four chips false → "Tous" implicit, return all for_sale (sold
 *     stays excluded unless showSold is also on).
 *   - showStale alone → only stale rows.
 *   - showOnline + showStale → all online (stale is already a subset).
 *   - showOffline + showStale → offline + stale (a useful "things to act
 *     on" view: cards not yet listed plus listings overdue for refresh).
 */

import { isListingStale } from './listing-stale';

export interface ChipState {
  showOnline: boolean;
  showOffline: boolean;
  showStale: boolean;
  showSold: boolean;
}

export interface ListingShape {
  vinted_listed_at: string | null;
}

/**
 * Decides whether a for_sale card passes the active state chips. The `showSold`
 * chip is independent and ignored here — sold rows are gathered separately by
 * the caller.
 */
export function passesStateChips(
  card: ListingShape,
  chips: ChipState,
  now: number,
): boolean {
  const noStateChip = !chips.showOnline && !chips.showOffline && !chips.showStale;
  if (noStateChip) return true; // "Tous" — show every for_sale row

  const isOnline = card.vinted_listed_at !== null;
  const isOffline = !isOnline;
  const isStale = isListingStale(card.vinted_listed_at, now);

  if (chips.showOnline && isOnline) return true;
  if (chips.showOffline && isOffline) return true;
  if (chips.showStale && isStale) return true;
  return false;
}

/**
 * Decides whether the for_sale pile should be shown at all. It's hidden only
 * when the user has activated `Vendus` AND no other state chip — a "show me
 * just my sold history" view.
 */
export function shouldHideForSalePile(chips: ChipState): boolean {
  return chips.showSold && !chips.showOnline && !chips.showOffline && !chips.showStale;
}
