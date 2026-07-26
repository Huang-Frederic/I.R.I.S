import { describe, expect, it } from 'vitest';
import { fromLocalInputValue, hasRealTime, toLocalInputValue } from './local-datetime';

describe('toLocalInputValue', () => {
  it('renders local wall time, not UTC', () => {
    // The bug this exists to prevent: toISOString().slice(0,16) would render
    // the UTC clock, shifting every game by the local offset.
    const d = new Date(2026, 6, 26, 15, 30);
    expect(toLocalInputValue(d)).toBe('2026-07-26T15:30');
  });

  it('pads every field to two digits', () => {
    expect(toLocalInputValue(new Date(2026, 0, 5, 9, 7))).toBe('2026-01-05T09:07');
  });

  it('keeps the local date late in the evening', () => {
    // 23:30 local is already the next day in UTC east of Greenwich; the input
    // must still show today.
    expect(toLocalInputValue(new Date(2026, 6, 26, 23, 30))).toBe('2026-07-26T23:30');
  });
});

describe('fromLocalInputValue', () => {
  it('round-trips through a local Date', () => {
    const d = new Date(2026, 6, 26, 15, 30);
    expect(fromLocalInputValue(toLocalInputValue(d))).toBe(d.toISOString());
  });

  it('reads the string as local time, so the instant matches the clock', () => {
    const iso = fromLocalInputValue('2026-07-26T15:30')!;
    const back = new Date(iso);
    expect(back.getHours()).toBe(15);
    expect(back.getMinutes()).toBe(30);
  });

  it('returns null on an empty or half-typed value', () => {
    // A cleared input must not travel as "Invalid Date".
    expect(fromLocalInputValue('')).toBeNull();
    expect(fromLocalInputValue('2026-07-26')).toBeNull();
    expect(fromLocalInputValue('pas une date')).toBeNull();
  });

  it('returns null on a well-shaped but impossible date', () => {
    expect(fromLocalInputValue('2026-13-45T99:99')).toBeNull();
  });

  it('tolerates the seconds some browsers append', () => {
    expect(fromLocalInputValue('2026-07-26T15:30:00')).toBe(
      new Date(2026, 6, 26, 15, 30).toISOString(),
    );
  });
});

describe('hasRealTime', () => {
  it('rejects the placeholders the pipeline produced', () => {
    // Games imported before the form captured a time sit at exactly midnight
    // or midday UTC. In Paris those render as 02:00 and 14:00 — which read as
    // real results.
    expect(hasRealTime('2026-07-26T00:00:00.000Z')).toBe(false);
    expect(hasRealTime('2026-07-25T12:00:00.000Z')).toBe(false);
  });

  it('accepts a captured time', () => {
    expect(hasRealTime('2026-07-26T14:14:00.000Z')).toBe(true);
    expect(hasRealTime('2026-07-26T21:37:00.000Z')).toBe(true);
  });

  it('hides a real time that lands on the hour, rather than risk a wrong one', () => {
    // The deliberate cost of a blunt test: omitting a correct time is a smaller
    // wrong than displaying an invented one.
    expect(hasRealTime('2026-07-26T18:00:00.000Z')).toBe(false);
  });

  it('is false on an unparseable value instead of throwing', () => {
    expect(hasRealTime('pas une date')).toBe(false);
  });
});
