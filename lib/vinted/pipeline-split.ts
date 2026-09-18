// lib/vinted/pipeline-split.ts
/**
 * Splits an ordered queue pipeline into "today" (the first `dailyQuota`
 * items, framed in the UI) and "later" (the rest, shown de-emphasized in
 * the same horizontal scroll).
 */
export function splitPipelineByQuota<T>(items: T[], dailyQuota: number): { today: T[]; later: T[] } {
  return { today: items.slice(0, dailyQuota), later: items.slice(dailyQuota) };
}
