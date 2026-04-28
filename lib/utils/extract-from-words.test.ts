import { describe, expect, it } from 'vitest';
import {
  findKnownSetCodeInText,
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

  it('finds a single-word "<card>/<total>" on a full-card photo', () => {
    const words: WordAnnotation[] = [
      w('ズルッグ', 0.1, 0.05),
      w('70', 0.85, 0.05),
      w('136/174', 0.15, 0.92), // bottom-left footer
      w('Pokémon', 0.4, 0.97),
    ];
    expect(findSetNumberCandidate(words)).toEqual({
      card: '136',
      total: '174',
      raw: '136/174',
    });
  });

  it('finds the set number on a tightly cropped footer (whole image is the footer)', () => {
    // After cropping just the footer of the card, the text sits in the
    // middle-ish of the new image. The previous strict region-filter design
    // dropped it; now footerScore is a tie-breaker, not a gate.
    const words: WordAnnotation[] = [w('111/086', 0.4, 0.4)];
    expect(findSetNumberCandidate(words)).toEqual({
      card: '111',
      total: '086',
      raw: '111/086',
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

  it('prefers the most footer-like match when multiple slash-numbers appear', () => {
    // Attack damage "30/30" mid-card vs real set number bottom-left.
    const words: WordAnnotation[] = [
      w('30/30', 0.5, 0.4),     // mid-card noise
      w('136/174', 0.1, 0.92),  // real footer
    ];
    expect(findSetNumberCandidate(words)).toEqual({
      card: '136',
      total: '174',
      raw: '136/174',
    });
  });

  it('drops words below minConfidence', () => {
    const words: WordAnnotation[] = [w('136/174', 0.15, 0.92, 0.05, 0.02, 0.4)];
    expect(findSetNumberCandidate(words, { minConfidence: 0.7 })).toBeNull();
  });

  it('extracts the number even when Vision glues a rarity glyph onto it', () => {
    // Real-world case: "098/150RR" comes back as one token because the small
    // rarity letters touch the number. Strict ^XXX/YYY$ misses it.
    const words: WordAnnotation[] = [w('098/150RR', 0.7, 0.92)];
    expect(findSetNumberCandidate(words)).toEqual({
      card: '098',
      total: '150',
      raw: '098/150',
    });
  });

  it('extracts from "034/054RR XYm" (number + rarity + set code as one OCR line)', () => {
    const words: WordAnnotation[] = [w('034/054RR', 0.5, 0.93)];
    expect(findSetNumberCandidate(words)).toEqual({
      card: '034',
      total: '054',
      raw: '034/054',
    });
  });
});

describe('findSetCodeCandidate', () => {
  it('returns null when no alphanumeric tokens look like a code', () => {
    expect(findSetCodeCandidate([], null)).toBeNull();
  });

  it('finds a code-shaped token next to the set number', () => {
    const words: WordAnnotation[] = [
      w('ズルッグ', 0.1, 0.05),
      w('sv1W', 0.05, 0.92),
      w('111/086', 0.15, 0.92),
    ];
    expect(findSetCodeCandidate(words, '111/086')).toBe('sv1W');
  });

  it('finds a code-shaped token on a footer-only crop', () => {
    const words: WordAnnotation[] = [
      w('sv1W', 0.3, 0.4),
      w('111/086', 0.5, 0.4),
    ];
    expect(findSetCodeCandidate(words, '111/086')).toBe('sv1W');
  });

  it('skips pure-digit tokens', () => {
    const words: WordAnnotation[] = [w('1234', 0.05, 0.92)];
    expect(findSetCodeCandidate(words, null)).toBeNull();
  });

  it('rejects illustrator names like "Miyanose" (letters but no digits)', () => {
    // Real-world bug: this 8-letter word geographically near the set number
    // was beating "sv1W" before we required both letters AND digits.
    const words: WordAnnotation[] = [
      w('Miyanose', 0.1, 0.85),
      w('111/086', 0.5, 0.92),
    ];
    expect(findSetCodeCandidate(words, '111/086')).toBeNull();
  });

  it('rejects all-letter tokens like "Pokemon"', () => {
    const words: WordAnnotation[] = [w('Pokemon', 0.4, 0.97)];
    expect(findSetCodeCandidate(words, null)).toBeNull();
  });

  it('rejects 2-char tokens like "x2" (weakness multiplier)', () => {
    const words: WordAnnotation[] = [w('x2', 0.8, 0.6)];
    expect(findSetCodeCandidate(words, null)).toBeNull();
  });

  it('accepts mixed letter+digit codes', () => {
    expect(findSetCodeCandidate([w('sv1W', 0.05, 0.92)], null)).toBe('sv1W');
    expect(findSetCodeCandidate([w('SV11W', 0.05, 0.92)], null)).toBe('SV11W');
    expect(findSetCodeCandidate([w('sv1a', 0.05, 0.92)], null)).toBe('sv1a');
    expect(findSetCodeCandidate([w('swsh4', 0.05, 0.92)], null)).toBe('swsh4');
  });

  it('skips the set number itself', () => {
    const words: WordAnnotation[] = [w('136/174', 0.15, 0.92)];
    expect(findSetCodeCandidate(words, '136/174')).toBeNull();
  });

  it('prefers the closest code-shaped neighbor when multiple are present', () => {
    const words: WordAnnotation[] = [
      w('FAR', 0.0, 0.05),     // top-left, far from set number
      w('sv1W', 0.1, 0.92),    // close to set number
      w('111/086', 0.15, 0.92),
    ];
    expect(findSetCodeCandidate(words, '111/086')).toBe('sv1W');
  });

  it('strips brackets and other punctuation Vision attaches', () => {
    const words: WordAnnotation[] = [w('[sv1W]', 0.05, 0.92)];
    expect(findSetCodeCandidate(words, null)).toBe('sv1W');
  });

  it('strips trailing comma / dot', () => {
    const words: WordAnnotation[] = [
      w('sv1W,', 0.05, 0.92),
      w('Pokémon.', 0.4, 0.97),
    ];
    expect(findSetCodeCandidate(words, null)).toBe('sv1W');
  });

  it('rejects "NO0499" (Pokédex number "全国図鑑NO.0499")', () => {
    const words: WordAnnotation[] = [w('NO0499', 0.4, 0.3)];
    expect(findSetCodeCandidate(words, null)).toBeNull();
  });

  it('rejects "Wx2" (weakness multiplier)', () => {
    const words: WordAnnotation[] = [w('Wx2', 0.5, 0.85)];
    expect(findSetCodeCandidate(words, null)).toBeNull();
  });

  it('rejects "C2021" / "P2018" (copyright year prefixes)', () => {
    expect(findSetCodeCandidate([w('C2021', 0.4, 0.95)], null)).toBeNull();
    expect(findSetCodeCandidate([w('P2018', 0.4, 0.95)], null)).toBeNull();
  });

  it('rejects "5ban" (5ban Graphics watermark)', () => {
    const words: WordAnnotation[] = [w('5ban', 0.4, 0.92)];
    expect(findSetCodeCandidate(words, null)).toBeNull();
  });

  it('rejects "HP160" (HP indicator glued together)', () => {
    const words: WordAnnotation[] = [w('HP160', 0.5, 0.1)];
    expect(findSetCodeCandidate(words, null)).toBeNull();
  });
});

describe('findKnownSetCodeInText', () => {
  const knownIds = ['sv11w', 'sv11b', 'sv8a', 'sv8', 'sv5a', 'bw5', 'bw8', 'sm8b', 'xym', 'm3', 's12a'];

  it('returns null for empty text', () => {
    expect(findKnownSetCodeInText('', knownIds)).toBeNull();
  });

  it('finds an exact match in OCR text', () => {
    const text = 'Illus. Tecziro SV8a 069/187';
    expect(findKnownSetCodeInText(text, knownIds)).toBe('sv8a');
  });

  it('finds a match through OCR confusion (BWS → bw5, S↔5)', () => {
    const text = 'Illus. Eske Yoshinob 009/050 BWS';
    expect(findKnownSetCodeInText(text, knownIds)).toBe('bw5');
  });

  it('finds a match through OCR confusion (SvllW → sv11w, l↔1)', () => {
    const text = 'SvllW 012/086 C 2025 Pokémon';
    expect(findKnownSetCodeInText(text, knownIds)).toBe('sv11w');
  });

  it('finds the longer canonical match when both fit', () => {
    // "sv8" and "sv8a" are both in the list — the OCR text "SV8a" should
    // resolve to sv8a (longer = more specific).
    const text = 'SV8a 055/187';
    expect(findKnownSetCodeInText(text, knownIds)).toBe('sv8a');
  });

  it('returns null when nothing in the text matches', () => {
    const text = 'Pokemon Trainer Card Energy';
    expect(findKnownSetCodeInText(text, knownIds)).toBeNull();
  });

  it('handles punctuation around the token', () => {
    const text = 'Illus. (sm8b) 098/150RR';
    expect(findKnownSetCodeInText(text, knownIds)).toBe('sm8b');
  });
});
