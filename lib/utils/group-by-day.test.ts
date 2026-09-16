// lib/utils/group-by-day.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { groupByDay } from './group-by-day';

// Pinned so "same local day" assertions below don't depend on the machine
// running the tests — Date's local getters read process.env.TZ live.
describe('groupByDay', () => {
  const originalTZ = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'UTC';
  });
  afterAll(() => {
    process.env.TZ = originalTZ;
  });

  it('groups rows played on the same local day together', () => {
    const rows = [
      { id: 'a', played_at: '2026-09-16T08:00:00.000Z' },
      { id: 'b', played_at: '2026-09-16T20:00:00.000Z' },
    ];
    const groups = groupByDay(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('sorts groups newest day first regardless of input row order', () => {
    const rows = [
      { id: 'old', played_at: '2026-09-10T12:00:00.000Z' },
      { id: 'new', played_at: '2026-09-16T12:00:00.000Z' },
    ];
    const groups = groupByDay(rows);
    expect(groups.map((g) => g.rows[0].id)).toEqual(['new', 'old']);
  });

  it('preserves within-day row order', () => {
    const rows = [
      { id: 'first', played_at: '2026-09-16T08:00:00.000Z' },
      { id: 'second', played_at: '2026-09-16T09:00:00.000Z' },
      { id: 'third', played_at: '2026-09-16T10:00:00.000Z' },
    ];
    const groups = groupByDay(rows);
    expect(groups[0].rows.map((r) => r.id)).toEqual(['first', 'second', 'third']);
  });

  it('returns an empty array for no rows', () => {
    expect(groupByDay([])).toEqual([]);
  });
});
