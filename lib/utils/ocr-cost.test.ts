import { describe, expect, it } from 'vitest';
import { computeVisionCostEur } from './ocr-cost';

describe('computeVisionCostEur', () => {
  it('returns 0 for 0 features', () => {
    expect(computeVisionCostEur(0)).toBe(0);
  });

  it('charges €0.001380 for 1 feature (1.5 USD/1000 × 0.92 EUR/USD)', () => {
    const result = computeVisionCostEur(1);
    expect(result).toBeCloseTo(0.00138, 6);
  });

  it('scales linearly', () => {
    const one = computeVisionCostEur(1);
    const ten = computeVisionCostEur(10);
    expect(ten).toBeCloseTo(one * 10, 6);
  });
});
