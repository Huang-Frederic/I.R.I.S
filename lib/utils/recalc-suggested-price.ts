/**
 * Decide the new suggested_price for a card after the cron pulls a new trend.
 *
 * Heuristic to respect manual edits: if the previous suggested_price was equal
 * (within 1 cent) to oldTrend × coeff, we assume it was auto-derived and we
 * recompute. Otherwise the user has touched it, so we keep their value.
 *
 * When oldTrend is null we have no baseline to make that decision, so we play
 * it safe and keep oldSuggested (only seed a fresh value when oldSuggested is
 * also null).
 */

const round2 = (x: number): number => Math.round(x * 100) / 100;

interface Args {
  oldTrend: number | null;
  newTrend: number | null;
  oldSuggested: number | null;
  coeff: number;
}

export function recalcSuggestedPrice(args: Args): number | null {
  if (args.newTrend === null) return args.oldSuggested;
  if (args.oldSuggested === null) return round2(args.newTrend * args.coeff);
  if (args.oldTrend === null) return args.oldSuggested;
  const expectedAuto = round2(args.oldTrend * args.coeff);
  const wasManual = Math.abs(args.oldSuggested - expectedAuto) > 0.01;
  if (wasManual) return args.oldSuggested;
  return round2(args.newTrend * args.coeff);
}
