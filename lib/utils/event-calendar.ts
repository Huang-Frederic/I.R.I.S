import type { StoreEventRow } from '@/lib/types';

export interface CalendarDay {
  /** YYYY-MM-DD (UTC) — matches the day-slice of an event's starts_at. */
  date: string;
  /** Belongs to the displayed month (vs a leading/trailing pad day). */
  inMonth: boolean;
  events: StoreEventRow[];
}

/** 'YYYY-MM' key of a UTC date. */
function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/** Distinct 'YYYY-MM' months that contain at least one dated event, ascending. */
export function monthsWithEvents(events: StoreEventRow[]): string[] {
  const set = new Set<string>();
  for (const e of events) {
    if (e.starts_at) set.add(e.starts_at.slice(0, 7));
  }
  return [...set].sort();
}

/**
 * Build a Monday-first month grid (weeks of 7 days) with each dated event
 * bucketed onto its UTC day. Undated events are ignored (they live in the list
 * view only). `month` is 0-indexed.
 */
export function buildMonthGrid(
  events: StoreEventRow[],
  year: number,
  month: number,
): CalendarDay[][] {
  const byDay = new Map<string, StoreEventRow[]>();
  for (const e of events) {
    if (!e.starts_at) continue;
    const key = e.starts_at.slice(0, 10);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(e);
    else byDay.set(key, [e]);
  }

  const first = new Date(Date.UTC(year, month, 1));
  const weekdayMonFirst = (first.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const totalCells = Math.ceil((weekdayMonFirst + daysInMonth) / 7) * 7;

  const start = new Date(first);
  start.setUTCDate(start.getUTCDate() - weekdayMonFirst);

  const days: CalendarDay[] = [];
  for (let i = 0; i < totalCells; i += 1) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    const sameMonth = d.getUTCFullYear() === year && d.getUTCMonth() === month;
    days.push({
      date: key,
      inMonth: sameMonth,
      events: (byDay.get(key) ?? []).sort((a, b) => (a.starts_at ?? '').localeCompare(b.starts_at ?? '')),
    });
  }

  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

/** The month to show first: the earliest month that has events, else the current one. */
export function initialMonth(events: StoreEventRow[], now: Date = new Date()): string {
  const months = monthsWithEvents(events);
  return months[0] ?? monthKey(now.getUTCFullYear(), now.getUTCMonth());
}
