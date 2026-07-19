/**
 * Vinted "stale listing" helpers — single source of truth for the 21-day
 * threshold used by the row badges, the "À rafraîchir" filter and the
 * interleaved sort.
 *
 * Every caller passes `vinted_posted_at` (when the listing went live on
 * Vinted via IRIS — reset on bump). A listing with no posted timestamp is
 * NEVER stale, even if the row is otherwise old: either it isn't live on
 * Vinted, or it's managed outside IRIS and there's nothing to bump.
 */

export const STALE_DAYS = 21;
export const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;

export function isListingStale(vintedPostedAt: string | null, now: number): boolean {
  if (vintedPostedAt === null) return false;
  return now - new Date(vintedPostedAt).getTime() > STALE_MS;
}

export function daysSinceListing(vintedPostedAt: string | null, now: number): number | null {
  if (vintedPostedAt === null) return null;
  return Math.floor((now - new Date(vintedPostedAt).getTime()) / (1000 * 60 * 60 * 24));
}
