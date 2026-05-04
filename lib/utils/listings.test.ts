import { describe, expect, it } from 'vitest';
import {
  getMyListing,
  getPartnerListing,
  isStaleForListing,
} from './listings';
import type { BaseListing } from '@/lib/types';

const MY_ID = 'my-uuid';
const PARTNER_ID = 'partner-uuid';

describe('getMyListing', () => {
  it('returns the listing for myUserId when present', () => {
    const listings: BaseListing[] = [
      { user_id: MY_ID, listed_at: '2026-05-01T12:00:00Z' },
      { user_id: PARTNER_ID, listed_at: '2026-04-15T08:00:00Z' },
    ];
    expect(getMyListing(listings, MY_ID)).toEqual(listings[0]);
  });

  it('returns null when myUserId has no listing', () => {
    const listings: BaseListing[] = [{ user_id: PARTNER_ID, listed_at: '2026-04-15T08:00:00Z' }];
    expect(getMyListing(listings, MY_ID)).toBeNull();
  });

  it('returns null on empty listings', () => {
    expect(getMyListing([], MY_ID)).toBeNull();
  });
});

describe('getPartnerListing', () => {
  it('returns the listing for partnerUserId when present', () => {
    const listings: BaseListing[] = [
      { user_id: MY_ID, listed_at: '2026-05-01T12:00:00Z' },
      { user_id: PARTNER_ID, listed_at: '2026-04-15T08:00:00Z' },
    ];
    expect(getPartnerListing(listings, PARTNER_ID)).toEqual(listings[1]);
  });

  it('returns null when partnerUserId is null', () => {
    const listings: BaseListing[] = [{ user_id: MY_ID, listed_at: '2026-05-01T12:00:00Z' }];
    expect(getPartnerListing(listings, null)).toBeNull();
  });
});

describe('isStaleForListing', () => {
  it('returns false when listing is null', () => {
    expect(isStaleForListing(null, Date.now())).toBe(false);
  });

  it('returns false for fresh listing (< 21 days)', () => {
    const now = new Date('2026-05-04T00:00:00Z').getTime();
    const listing: BaseListing = { user_id: MY_ID, listed_at: '2026-05-01T00:00:00Z' };
    expect(isStaleForListing(listing, now)).toBe(false);
  });

  it('returns true for stale listing (> 21 days)', () => {
    const now = new Date('2026-05-04T00:00:00Z').getTime();
    const listing: BaseListing = { user_id: MY_ID, listed_at: '2026-04-01T00:00:00Z' };
    expect(isStaleForListing(listing, now)).toBe(true);
  });
});
