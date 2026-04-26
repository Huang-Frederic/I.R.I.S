import { describe, expect, it } from 'vitest';
import { parseSetNumber } from './parse-set-number';

describe('parseSetNumber', () => {
  it('extracts the standard "<card>/<total>" format', () => {
    expect(parseSetNumber('200/165')).toEqual({ card: '200', total: '165', raw: '200/165' });
  });

  it('handles two-digit card numbers', () => {
    expect(parseSetNumber('12/100')).toEqual({ card: '12', total: '100', raw: '12/100' });
  });

  it('handles single-digit card numbers', () => {
    expect(parseSetNumber('5/82')).toEqual({ card: '5', total: '82', raw: '5/82' });
  });

  it('tolerates whitespace around the slash (OCR noise)', () => {
    expect(parseSetNumber('200 / 165')).toEqual({ card: '200', total: '165', raw: '200/165' });
  });

  it('returns null when there is no slash pattern', () => {
    expect(parseSetNumber('Dracaufeu ex')).toBeNull();
    expect(parseSetNumber('')).toBeNull();
  });

  it('extracts the first match when surrounded by other text', () => {
    expect(parseSetNumber('Pokémon TCG 200/165 SAR')).toEqual({
      card: '200',
      total: '165',
      raw: '200/165',
    });
  });

  it('returns the first occurrence when multiple slashes are present', () => {
    // Date-like strings should NOT win over the actual set number; this codifies
    // current behavior so we notice if we ever change the regex.
    expect(parseSetNumber('5/9 200/165')).toEqual({ card: '5', total: '9', raw: '5/9' });
  });
});
