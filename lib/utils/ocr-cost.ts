/**
 * Google Vision pricing: $1.50 per 1000 features (TEXT_DETECTION).
 * Each detectText() call counts as 1 feature.
 */
const VISION_USD_PER_1K = 1.5;
const USD_TO_EUR = 0.92;

export function computeVisionCostEur(featureCount: number): number {
  return (featureCount * VISION_USD_PER_1K * USD_TO_EUR) / 1000;
}
