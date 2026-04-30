import { describe, expect, it } from 'vitest';
import { formatStaleness } from './format-staleness';

const NOW = new Date('2026-05-01T12:00:00Z');
const dayMs = 24 * 60 * 60 * 1000;
const isoDaysAgo = (d: number) => new Date(NOW.getTime() - d * dayMs).toISOString();

describe('formatStaleness', () => {
  it('returns "never" when cm_updated_at is null', () => {
    expect(formatStaleness(null, NOW)).toEqual({
      tone: 'never',
      label: 'Jamais maj',
      daysSince: null,
    });
  });

  it('returns "fresh" when updated less than 24h ago', () => {
    expect(formatStaleness(isoDaysAgo(0), NOW)).toEqual({
      tone: 'fresh',
      label: 'Frais',
      daysSince: 0,
    });
  });

  it('returns "stale" at exactly 1 day ago (boundary)', () => {
    expect(formatStaleness(isoDaysAgo(1), NOW)).toEqual({
      tone: 'stale',
      label: 'Maj il y a 1j',
      daysSince: 1,
    });
  });

  it('returns "stale" between 1 and 7 days', () => {
    expect(formatStaleness(isoDaysAgo(3), NOW)).toEqual({
      tone: 'stale',
      label: 'Maj il y a 3j',
      daysSince: 3,
    });
    expect(formatStaleness(isoDaysAgo(7), NOW)).toEqual({
      tone: 'stale',
      label: 'Maj il y a 7j',
      daysSince: 7,
    });
  });

  it('returns "old" when more than 7 days', () => {
    expect(formatStaleness(isoDaysAgo(8), NOW)).toEqual({
      tone: 'old',
      label: 'Maj il y a 8j',
      daysSince: 8,
    });
    expect(formatStaleness(isoDaysAgo(45), NOW)).toEqual({
      tone: 'old',
      label: 'Maj il y a 45j',
      daysSince: 45,
    });
  });
});
