const EUR_FORMATTER = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
});

/**
 * Format a number as EUR (fr-FR locale, 2 decimals minimum).
 * Returns '—' for null/undefined so callers can pass nullable values directly.
 */
export function formatEur(n: number | null | undefined): string {
  if (n == null) return '—';
  return EUR_FORMATTER.format(n);
}
