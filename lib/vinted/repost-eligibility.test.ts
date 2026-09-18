import { describe, expect, it } from 'vitest';
import { isRepostEligible } from './repost-eligibility';

const NOW = new Date('2026-09-21T12:00:00Z');

describe('isRepostEligible', () => {
  it('is eligible when for_sale, listed, and older than repostAfterDays', () => {
    const item = {
      vintedListingId: 'v123',
      vintedPostedAt: '2026-09-01T12:00:00Z', // 20 days old
      status: 'for_sale' as const,
    };
    expect(isRepostEligible(item, 14, NOW)).toBe(true);
  });

  it('is not eligible when sold', () => {
    const item = { vintedListingId: 'v123', vintedPostedAt: '2026-09-01T12:00:00Z', status: 'sold' as const };
    expect(isRepostEligible(item, 14, NOW)).toBe(false);
  });

  it('is not eligible when younger than repostAfterDays', () => {
    const item = { vintedListingId: 'v123', vintedPostedAt: '2026-09-19T12:00:00Z', status: 'for_sale' as const }; // 2 days old
    expect(isRepostEligible(item, 14, NOW)).toBe(false);
  });

  it('is not eligible when there is no active listing', () => {
    const item = { vintedListingId: null, vintedPostedAt: null, status: 'for_sale' as const };
    expect(isRepostEligible(item, 14, NOW)).toBe(false);
  });
});
