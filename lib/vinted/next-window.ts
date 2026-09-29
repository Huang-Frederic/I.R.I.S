// lib/vinted/next-window.ts
import type { VintedBotScheduleRow } from '@/lib/types';

/** `Date.getDay()`: 0 = Sunday, 6 = Saturday — both are the "weekend" block. */
function blockForDay(dayOfWeek: number): 'weekday' | 'weekend' {
  return dayOfWeek === 0 || dayOfWeek === 6 ? 'weekend' : 'weekday';
}

/**
 * Estimates the next time the bot's schedule opens a posting window, for
 * the "prochain post estimé" display.
 */
export function nextScheduledWindowStart(
  schedule: Pick<VintedBotScheduleRow, 'block' | 'starts_at' | 'ends_at'>[],
  now: Date,
): Date | null {
  if (schedule.length === 0) return null;

  for (let offset = 0; offset <= 7; offset++) {
    const day = new Date(now);
    day.setDate(day.getDate() + offset);
    const block = blockForDay(day.getDay());
    const todaysWindows = schedule
      .filter((w) => w.block === block)
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
