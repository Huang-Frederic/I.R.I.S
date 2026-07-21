import { describe, it, expect } from 'vitest';
import { buildMonthGrid, monthsWithEvents, initialMonth, localDayKey } from './event-calendar';
import type { StoreEventRow } from '@/lib/types';

function ev(starts_at: string | null, id = starts_at ?? 'x'): StoreEventRow {
  return {
    id, source: 's', shop_name: 'S', city: 'Paris', title: 'E', event_type: 'league',
    starts_at, url: 'https://x', price: null, external_id: `s:${id}`, scraped_at: '2026-07-01T00:00:00Z',
  };
}

describe('buildMonthGrid', () => {
  // July 2026: 1 Jul is a Wednesday → Monday-first grid starts on 29 Jun.
  const weeks = buildMonthGrid(
    [ev('2026-07-01T10:00:00.000Z'), ev('2026-07-01T18:00:00.000Z', 'b'), ev('2026-07-31T12:00:00.000Z')],
    2026,
    6,
  );

  it('produces full weeks of 7 days each', () => {
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it('is Monday-first and pads the leading days out of month', () => {
    expect(weeks[0][0].date).toBe('2026-06-29'); // Monday before 1 Jul
    expect(weeks[0][0].inMonth).toBe(false);
    expect(weeks[0][2].date).toBe('2026-07-01'); // Wednesday
    expect(weeks[0][2].inMonth).toBe(true);
  });

  it('buckets multiple events onto the same day, time-sorted', () => {
    const jul1 = weeks[0][2];
    expect(jul1.events.map((e) => e.id)).toEqual(['2026-07-01T10:00:00.000Z', 'b']);
  });

  it('places the last day of the month correctly and ignores undated events', () => {
    const withUndated = buildMonthGrid([ev(null, 'u'), ev('2026-07-31T12:00:00.000Z')], 2026, 6);
    const allEvents = withUndated.flat().flatMap((d) => d.events);
    expect(allEvents.map((e) => e.id)).toEqual(['2026-07-31T12:00:00.000Z']);
  });
});

describe('monthsWithEvents', () => {
  it('returns distinct months ascending, skipping undated', () => {
    const events = [ev('2026-08-05T10:00:00Z'), ev('2026-07-01T10:00:00Z'), ev(null, 'u'), ev('2026-08-20T10:00:00Z', 'c')];
    expect(monthsWithEvents(events)).toEqual(['2026-07', '2026-08']);
  });
});

describe('initialMonth', () => {
  it('is the earliest month with events', () => {
    expect(initialMonth([ev('2026-09-01T10:00:00Z'), ev('2026-08-01T10:00:00Z')])).toBe('2026-08');
  });
  it('falls back to the current month when nothing is dated', () => {
    expect(initialMonth([ev(null, 'u')], new Date('2026-07-20T00:00:00Z'))).toBe('2026-07');
  });
});

describe('localDayKey', () => {
  it('formats a date as YYYY-MM-DD with zero-padding', () => {
    expect(localDayKey(new Date(2026, 6, 5))).toBe('2026-07-05'); // month is 0-indexed
    expect(localDayKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});
