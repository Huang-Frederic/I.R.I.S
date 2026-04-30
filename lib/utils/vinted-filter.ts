/**
 * Vinted state-chip filter logic. Pure, tested, shared.
 *
 * The three state chips correspond to MUTUALLY EXCLUSIVE buckets — every
 * for_sale card belongs to exactly one. Combinations are unions.
 *
 *   - Pas en ligne (showOffline) → vinted_listed_at === null
 *   - À rafraîchir (showStale)   → listed for more than 21 days
 *   - En ligne     (showOnline)  → listed within the last 21 days (FRESH only)
 *
 * `showOnline` deliberately does NOT include stale rows: each chip stands
 * for one bucket. So "En ligne + À rafraîchir" produces all-online (the
 * union of fresh + stale), and "En ligne" alone shows just the fresh ones.
 *
 *   - showSold (Vendus) → status = sold (handled separately by caller).
 *
 * Edge cases:
 *   - All three state chips false → "Tous" implicit, every for_sale passes.
 *   - showOnline alone → fresh only.
 *   - showStale alone  → stale only.
 *   - showOnline + showStale → all listed (fresh + stale).
 *   - showOffline + showStale → offline + stale ("things to act on").
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
  const isStale = isOnline && isListingStale(card.vinted_listed_at, now);
  const isFresh = isOnline && !isStale;
  const isOffline = !isOnline;

  if (chips.showOnline && isFresh) return true;
  if (chips.showStale && isStale) return true;
  if (chips.showOffline && isOffline) return true;
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
