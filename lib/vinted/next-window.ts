// lib/vinted/next-window.ts
import type { VintedBotScheduleRow } from '@/lib/types';

/**
 * Estimates the next time the bot's schedule opens a posting window, for
 * the "prochain post estimé" display. `Date.getDay()` already returns
 * 0=Sunday, matching the spec's day_of_week convention directly — no
 * conversion needed (unlike the Python agent's `(weekday()+1)%7`, since
 * Python's own `weekday()` is 0=Monday).
 */
export function nextScheduledWindowStart(
  schedule: Pick<VintedBotScheduleRow, 'day_of_week' | 'starts_at' | 'ends_at'>[],
  now: Date,
): Date | null {
  if (schedule.length === 0) return null;

  for (let offset = 0; offset <= 7; offset++) {
    const day = new Date(now);
    day.setDate(day.getDate() + offset);
    const dayOfWeek = day.getDay();
    const todaysWindows = schedule
      .filter((w) => w.day_of_week === dayOfWeek)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

    for (const window of todaysWindows) {
      const [startH, startM] = window.starts_at.split(':').map(Number);
      const [endH, endM] = window.ends_at.split(':').map(Number);
      const windowStart = new Date(day);
      windowStart.setHours(startH, startM, 0, 0);
      const windowEnd = new Date(day);
      windowEnd.setHours(endH, endM, 0, 0);

      if (offset === 0 && now >= windowStart && now <= windowEnd) return now;
      if (windowStart > now) return windowStart;
    }
  }
  return null;
}
