import { describe, expect, it } from 'vitest';
import { isEligibleForQueue } from './queue-eligibility';

describe('isEligibleForQueue', () => {
  it('is eligible when for_sale with a confirmed price', () => {
    expect(isEligibleForQueue({ status: 'for_sale', price_confirmed_at: '2026-09-18T10:00:00.000Z' })).toBe(true);
  });

  it('is not eligible when the price was never confirmed by the user', () => {
    // suggested_price can be non-null here too (auto-computed by the price
    // cron) — price_confirmed_at is the only signal this function reads.
    expect(isEligibleForQueue({ status: 'for_sale', price_confirmed_at: null })).toBe(false);
  });

  it('is not eligible when not for_sale, even with a confirmed price', () => {
    expect(isEligibleForQueue({ status: 'sold', price_confirmed_at: '2026-09-18T10:00:00.000Z' })).toBe(false);
    expect(isEligibleForQueue({ status: 'collection', price_confirmed_at: '2026-09-18T10:00:00.000Z' })).toBe(false);
  });
});
