const EUR_FORMATTER = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
});

export function formatEur(n: number): string {
  return EUR_FORMATTER.format(n);
}
