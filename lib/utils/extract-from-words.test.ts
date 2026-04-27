import { describe, expect, it } from 'vitest';
import {
  findSetCodeCandidate,
  findSetNumberCandidate,
} from './extract-from-words';
import type { WordAnnotation } from '@/lib/types';

function w(
  text: string,
  x: number,
  y: number,
  width = 0.05,
  height = 0.02,
  confidence = 0.95,
): WordAnnotation {
  return { text, x, y, width, height, confidence };
}

describe('findSetNumberCandidate', () => {
  it('returns null when there are no words', () => {
    expect(findSetNumberCandidate([])).toBeNull();
  });

  it('finds a single-word "<card>/<total>" in the bottom-left footer', () => {
    const words: WordAnnotation[] = [
      w('ズルッグ', 0.1, 0.05),     // top-left, name
      w('70', 0.85, 0.05),          // top-right, HP
      w('136/174', 0.15, 0.92),     // bottom-left footer ← target
      w('Pokémon', 0.4, 0.97),      // bottom copyright
    ];
    expect(findSetNumberCandidate(words)).toEqual({
      card: '136',
      total: '174',
      raw: '136/174',
    });
  });

  it('combines split tokens "136" "/" "174" when Vision tokenized aggressively', () => {
    const words: WordAnnotation[] = [
      w('136', 0.1, 0.92),
      w('/', 0.13, 0.92),
      w('174', 0.16, 0.92),
    ];
    expect(findSetNumberCandidate(words)).toEqual({
      card: '136',
      total: '174',
      raw: '136/174',
    });
  });

  it('ignores set-number-like text outside the footer (e.g. attack damage 30/30)', () => {
    const words: WordAnnotation[] = [
      w('30/30', 0.5, 0.4), // mid-card, in attack region
    ];
    expect(findSetNumberCandidate(words)).toBeNull();
  });

  it('ignores text in the bottom-RIGHT region (copyright lines)', () => {
    const words: WordAnnotation[] = [
      w('100/100', 0.85, 0.95), // bottom-right
    ];
    expect(findSetNumberCandidate(words)).toBeNull();
  });

  it('drops words below minConfidence', () => {
    const words: WordAnnotation[] = [w('136/174', 0.15, 0.92, 0.05, 0.02, 0.4)];
    expect(findSetNumberCandidate(words, { minConfidence: 0.7 })).toBeNull();
  });

  it('respects a custom region', () => {
    const words: WordAnnotation[] = [w('136/174', 0.15, 0.5)]; // mid-card
    const region = { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
    expect(findSetNumberCandidate(words, { region })).toEqual({
      card: '136',
      total: '174',
      raw: '136/174',
    });
  });
});

describe('findSetCodeCandidate', () => {
  it('returns null when no alphanumeric tokens are in the footer', () => {
    expect(findSetCodeCandidate([], null)).toBeNull();
  });

  it('finds a code-shaped token in the footer (e.g. SV11W)', () => {
    const words: WordAnnotation[] = [
      w('ズルッグ', 0.1, 0.05),
      w('SV11W', 0.05, 0.92),
      w('136/174', 0.15, 0.92),
    ];
    expect(findSetCodeCandidate(words, '136/174')).toBe('SV11W');
  });

  it('skips pure-digit tokens (those are numbers, not codes)', () => {
    const words: WordAnnotation[] = [w('1234', 0.05, 0.92)];
    expect(findSetCodeCandidate(words, null)).toBeNull();
  });

  it('skips the set number itself', () => {
    const words: WordAnnotation[] = [w('136/174', 0.15, 0.92)];
    expect(findSetCodeCandidate(words, '136/174')).toBeNull();
  });

  it('prefers the closest code-shaped neighbor when multiple are present', () => {
    const words: WordAnnotation[] = [
      w('FAR', 0.0, 0.92),       // far left
      w('SV11W', 0.1, 0.92),     // close to number
      w('136/174', 0.15, 0.92),
    ];
    expect(findSetCodeCandidate(words, '136/174')).toBe('SV11W');
  });

  it('strips trailing punctuation Vision sometimes attaches', () => {
    const words: WordAnnotation[] = [w('SV11W,', 0.05, 0.92)];
    expect(findSetCodeCandidate(words, null)).toBe('SV11W');
  });
});
