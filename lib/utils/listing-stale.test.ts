import { describe, expect, it } from 'vitest';
import { isListingStale, daysSinceListing, STALE_DAYS } from './listing-stale';

const NOW = new Date('2026-04-30T12:00:00Z').getTime();
const dayMs = 24 * 60 * 60 * 1000;
const isoDaysAgo = (d: number) => new Date(NOW - d * dayMs).toISOString();

describe('isListingStale', () => {
  it('returns false when not listed (vinted_listed_at = null)', () => {
    // Even an ancient row that has never been online cannot be "stale" —
    // there is nothing to refresh on Vinted.
    expect(isListingStale(null, NOW)).toBe(false);
  });

  it('returns false when listed today', () => {
    expect(isListingStale(isoDaysAgo(0), NOW)).toBe(false);
  });

  it('returns false when listed exactly at the threshold (21 days)', () => {
    // Threshold is "MORE than 21 days", so 21 days exactly is fresh.
    expect(isListingStale(isoDaysAgo(STALE_DAYS), NOW)).toBe(false);
  });

  it('returns true when listed more than 21 days ago', () => {
    expect(isListingStale(isoDaysAgo(STALE_DAYS + 1), NOW)).toBe(true);
    expect(isListingStale(isoDaysAgo(34), NOW)).toBe(true);
  });

  it('does NOT use date_added — only vinted_listed_at controls staleness', () => {
    // This is the bug we just fixed: previously isStale looked at
    // (cm_updated_at ?? date_added), so cards seeded with vinted_listed_at
    // ~30 days ago but date_added=today were never marked stale. Now we
    // only look at vinted_listed_at and the answer is unambiguous.
    expect(isListingStale(isoDaysAgo(30), NOW)).toBe(true);
  });
});

describe('daysSinceListing', () => {
  it('returns null when not listed', () => {
    expect(daysSinceListing(null, NOW)).toBeNull();
  });

  it('returns 0 today', () => {
    expect(daysSinceListing(isoDaysAgo(0), NOW)).toBe(0);
  });

  it('returns the floor count of full days elapsed', () => {
    expect(daysSinceListing(isoDaysAgo(5), NOW)).toBe(5);
    expect(daysSinceListing(isoDaysAgo(34), NOW)).toBe(34);
  });
});
