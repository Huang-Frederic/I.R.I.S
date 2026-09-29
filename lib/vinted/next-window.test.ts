// lib/vinted/next-window.test.ts
import { describe, expect, it } from 'vitest';
import { nextScheduledWindowStart } from './next-window';

describe('nextScheduledWindowStart', () => {
  it('returns null when there is no schedule at all', () => {
    expect(nextScheduledWindowStart([], new Date('2026-09-21T12:00:00'))).toBeNull();
  });

  it('returns now when currently inside a window', () => {
    const monday = new Date('2026-09-21T12:00:00'); // a Monday → weekday block
    const schedule = [{ block: 'weekday' as const, starts_at: '11:00:00', ends_at: '13:00:00' }];
    expect(nextScheduledWindowStart(schedule, monday)).toEqual(monday);
  });

  it("returns today's window start when it hasn't started yet", () => {
    const monday9am = new Date('2026-09-21T09:00:00');
    const schedule = [{ block: 'weekday' as const, starts_at: '11:00:00', ends_at: '13:00:00' }];
    expect(nextScheduledWindowStart(schedule, monday9am)).toEqual(new Date('2026-09-21T11:00:00'));
  });

  it('returns the next day with a window when today has none left', () => {
    const monday3pm = new Date('2026-09-21T15:00:00'); // Monday's window already passed
    const schedule = [{ block: 'weekend' as const, starts_at: '10:00:00', ends_at: '12:00:00' }]; // next Saturday
    expect(nextScheduledWindowStart(schedule, monday3pm)).toEqual(new Date('2026-09-26T10:00:00'));
  });

  it('treats Saturday and Sunday as the same "weekend" block', () => {
    const saturday9am = new Date('2026-09-26T09:00:00'); // a Saturday
    const schedule = [{ block: 'weekend' as const, starts_at: '10:00:00', ends_at: '12:00:00' }];
    expect(nextScheduledWindowStart(schedule, saturday9am)).toEqual(new Date('2026-09-26T10:00:00'));

    const sunday9am = new Date('2026-09-27T09:00:00'); // the following Sunday
    expect(nextScheduledWindowStart(schedule, sunday9am)).toEqual(new Date('2026-09-27T10:00:00'));
  });
});
