// lib/utils/group-by-day.ts
export interface DayGroup<T> {
  /** Local calendar date as `YYYY-MM-DD` — stable within a session, safe as a React key. */
  dayKey: string;
  /** Midnight local time for this day; callers format it however they like. */
  date: Date;
  rows: T[];
}

/**
 * Buckets rows by the LOCAL calendar day of their `played_at` timestamp,
 * newest day first. Built for the Battle Logs history list — nothing in
 * this repo grouped by day before this.
 */
export function groupByDay<T extends { played_at: string }>(rows: T[]): DayGroup<T>[] {
  const buckets = new Map<string, DayGroup<T>>();
  for (const row of rows) {
    const d = new Date(row.played_at);
    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    // Manual formatting, not toISOString(): converting a local midnight Date
    // to an ISO (UTC) string can shift it onto the adjacent day depending on
    // the machine's timezone offset.
    const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const existing = buckets.get(dayKey);
    if (existing) existing.rows.push(row);
    else buckets.set(dayKey, { dayKey, date, rows: [row] });
  }
  return [...buckets.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
}
