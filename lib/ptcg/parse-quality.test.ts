import { describe, expect, it } from 'vitest';
import { parseQuality } from './parse-quality';

const log = (lines: number) => Array.from({ length: lines }, (_, i) => `ligne ${i}`).join('\n');

describe('parseQuality', () => {
  it('accepts a clean parse', () => {
    expect(parseQuality(log(300), 0)).toEqual({ ratio: 0, degraded: false });
  });

  it('accepts a handful of unrecognised lines', () => {
    // Five lines out of three hundred is a phrasing the tokenizer has yet to
    // learn, not a damaged input. Refusing here would block every game the
    // week a new set introduces one new sentence.
    expect(parseQuality(log(300), 5).degraded).toBe(false);
  });

  it('refuses when a fifth of the log was not read', () => {
    // The real case: a paste lost all 67 bullet lines of a 324-line log,
    // taking every damage-analysis block with them. The oracle then had one
    // check to run, passed it, and the game went through.
    const q = parseQuality(log(324), 67);
    expect(q.degraded).toBe(true);
    expect(Math.round(q.ratio * 100)).toBe(21);
  });

  it('ignores blank lines, which are not content', () => {
    // A log padded with blank lines between turns must not look cleaner than
    // it is just because the denominator grew.
    const padded = log(100)
      .split('\n')
      .flatMap((l) => [l, ''])
      .join('\n');
    expect(parseQuality(padded, 10).ratio).toBeCloseTo(0.1, 5);
  });

  it('treats an empty log as fully degraded rather than perfect', () => {
    expect(parseQuality('', 0)).toEqual({ ratio: 1, degraded: true });
    expect(parseQuality('   \n\n  ', 0).degraded).toBe(true);
  });

  it('sits the boundary just above the threshold', () => {
    expect(parseQuality(log(100), 5).degraded).toBe(false);
    expect(parseQuality(log(100), 6).degraded).toBe(true);
  });
});
