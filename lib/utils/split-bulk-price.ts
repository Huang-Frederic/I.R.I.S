/**
 * Split a total price equally across N items, rounded to cents.
 * The LAST item gets the remainder so the sum matches the input total exactly.
 *
 * Why this matters: 100€ split among 3 items naively gives 33.33 × 3 = 99.99
 * (1¢ short). Banking rule: last bucket absorbs the rounding error.
 *
 * Examples:
 *   splitPrice(100, 4) → [25, 25, 25, 25]
 *   splitPrice(100, 3) → [33.33, 33.33, 33.34]   (sum = 100.00)
 *   splitPrice(0, 5)   → [0, 0, 0, 0, 0]
 *   splitPrice(80, 1)  → [80]
 *   splitPrice(50, 0)  → throws (caller must guard against empty selection)
 */
export function splitPrice(total: number, n: number): number[] {
  if (n <= 0) {
    throw new Error(`splitPrice: n must be > 0, got ${n}`);
  }
  // Work in cents (integer math) to avoid float drift.
  const totalCents = Math.round(total * 100);
  const baseCents = Math.floor(totalCents / n);
  const remainderCents = totalCents - baseCents * n;
  const out: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = baseCents / 100;
  }
  // Put the remainder on the last item.
  out[n - 1] = (baseCents + remainderCents) / 100;
  return out;
}
