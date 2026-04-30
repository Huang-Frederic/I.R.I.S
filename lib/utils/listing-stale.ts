/**
 * Vinted "stale listing" helpers — single source of truth for the 21-day
 * threshold used by both the toggle UI and the "À rafraîchir" filter.
 *
 * A listing is stale when it has been online (vinted_listed_at != null) for
 * MORE than 21 days. Cards that are not online (vinted_listed_at == null)
 * are NEVER stale, even if the row is otherwise old: there's nothing to
 * refresh on Vinted if the listing isn't live there.
 */

export const STALE_DAYS = 21;
export const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;

export function isListingStale(vintedListedAt: string | null, now: number): boolean {
  if (vintedListedAt === null) return false;
  return now - new Date(vintedListedAt).getTime() > STALE_MS;
}

export function daysSinceListing(vintedListedAt: string | null, now: number): number | null {
  if (vintedListedAt === null) return null;
  return Math.floor((now - new Date(vintedListedAt).getTime()) / (1000 * 60 * 60 * 24));
}
