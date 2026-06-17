import { isListingStale } from './listing-stale';
import type { BaseListing } from '@/lib/types';

/**
 * Returns the listing belonging to `myUserId`, or null if none exists.
 * Generic — works on any listings array (CardListing[] or LotListing[]).
 */
export function getMyListing<L extends BaseListing>(
  listings: L[],
  myUserId: string,
): L | null {
  return listings.find((l) => l.user_id === myUserId) ?? null;
}

/**
 * Returns the listing belonging to `partnerUserId`, or null. When
 * `partnerUserId` is null (partner account not yet provisioned), returns
 * null gracefully without scanning.
 */
export function getPartnerListing<L extends BaseListing>(
  listings: L[],
  partnerUserId: string | null,
): L | null {
  if (!partnerUserId) return null;
  return listings.find((l) => l.user_id === partnerUserId) ?? null;
}

/**
 * Wrap the existing `isListingStale` helper to operate on a per-user listing
 * row rather than the legacy `cards.vinted_listed_at` field.
 */
export function isStaleForListing(
  listing: BaseListing | null,
  now: number,
): boolean {
  if (!listing) return false;
  // Only stale when actually posted to Vinted — listed_at is the IRIS listing
  // date and may be old even if the item was never posted to Vinted.
  if (!listing.vinted_listing_id) return false;
  return isListingStale(listing.vinted_posted_at, now);
}
