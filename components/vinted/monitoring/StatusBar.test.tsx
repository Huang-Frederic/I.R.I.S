import { describe, it, expect } from 'vitest';
import { formatNextPost } from './StatusBar';

describe('formatNextPost', () => {
  it('labels a time on the same calendar day as "today"', () => {
    const now = new Date('2026-09-30T09:00:00');
    const nextPost = new Date('2026-09-30T11:00:00');
    expect(formatNextPost(nextPost, now)).toBe("Aujourd'hui 11:00");
  });

  it('falls back to the abbreviated weekday for any other day', () => {
    const now = new Date('2026-09-30T09:00:00'); // a Wednesday
    const nextPost = new Date('2026-10-01T11:00:00'); // Thursday
    expect(formatNextPost(nextPost, now)).toBe('jeu. 11:00');
  });

  it('does not treat a time past midnight tonight as "today" once it has rolled over', () => {
    const now = new Date('2026-10-01T00:30:00');
    const nextPost = new Date('2026-09-30T23:00:00');
    expect(formatNextPost(nextPost, now)).toBe('mer. 23:00');
  });
});
