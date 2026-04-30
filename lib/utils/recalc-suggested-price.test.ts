import { describe, expect, it } from 'vitest';
import { recalcSuggestedPrice } from './recalc-suggested-price';

describe('recalcSuggestedPrice', () => {
  const coeff = 0.85;

  it('returns the existing suggested_price when newTrend is null', () => {
    expect(
      recalcSuggestedPrice({
        oldTrend: 10, newTrend: null, oldSuggested: 8.5, coeff,
      }),
    ).toBe(8.5);
  });

  it('computes from newTrend when oldSuggested was never set', () => {
    expect(
      recalcSuggestedPrice({
        oldTrend: null, newTrend: 12, oldSuggested: null, coeff,
      }),
    ).toBe(10.2);
  });

  it('recomputes when oldSuggested looks auto-derived (oldTrend × coeff)', () => {
    // oldSuggested = 10 * 0.85 = 8.5  → never edited manually
    expect(
      recalcSuggestedPrice({
        oldTrend: 10, newTrend: 12, oldSuggested: 8.5, coeff,
      }),
    ).toBe(10.2);
  });

  it('preserves oldSuggested when it does NOT match oldTrend × coeff (manual edit)', () => {
    // oldSuggested = 15.0 ≠ 10 * 0.85, so the user touched it. Don't overwrite.
    expect(
      recalcSuggestedPrice({
        oldTrend: 10, newTrend: 12, oldSuggested: 15, coeff,
      }),
    ).toBe(15);
  });

  it('preserves oldSuggested when there is no oldTrend baseline to compare against', () => {
    // Cannot tell if it was auto or manual without the baseline → respect.
    expect(
      recalcSuggestedPrice({
        oldTrend: null, newTrend: 12, oldSuggested: 9, coeff,
      }),
    ).toBe(9);
  });
});
