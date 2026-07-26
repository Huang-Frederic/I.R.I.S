import { describe, expect, it } from 'vitest';
import { inlineMarkup } from './inline-markup';

const plain = (text: string) => ({ text, bold: false, italic: false });
const bold = (text: string) => ({ text, bold: true, italic: false });
const italic = (text: string) => ({ text, bold: false, italic: true });

describe('inlineMarkup', () => {
  it('leaves plain text alone', () => {
    expect(inlineMarkup('rien à signaler')).toEqual([plain('rien à signaler')]);
  });

  it('splits a bold run out of the middle', () => {
    expect(inlineMarkup('tu as **deux Feurisson** en jeu')).toEqual([
      plain('tu as '),
      bold('deux Feurisson'),
      plain(' en jeu'),
    ]);
  });

  it('reads a single asterisk as italic', () => {
    expect(inlineMarkup('elle vire Abîme Zéro *et* retire 30 PV')).toEqual([
      plain('elle vire Abîme Zéro '),
      italic('et'),
      plain(' retire 30 PV'),
    ]);
  });

  it('does not mistake a bold run for italics', () => {
    // The italic branch would otherwise match the inner `*x*` of `**x**`.
    expect(inlineMarkup('**290**')).toEqual([bold('290')]);
  });

  it('handles bold and italic in the same line', () => {
    expect(inlineMarkup('**a** puis *b*')).toEqual([bold('a'), plain(' puis '), italic('b')]);
  });

  it('treats an unclosed marker as literal text', () => {
    // Real bodies contain arithmetic like "40+10**"; swallowing the rest of the
    // paragraph because a marker never closed would lose the finding.
    expect(inlineMarkup('il te fallait **290')).toEqual([plain('il te fallait **290')]);
  });

  it('keeps a run that starts the string', () => {
    expect(inlineMarkup('**290** requis')).toEqual([bold('290'), plain(' requis')]);
  });

  it('preserves newlines, which carry paragraph breaks in the bodies', () => {
    expect(inlineMarkup('un\n\ndeux')).toEqual([plain('un\n\ndeux')]);
  });

  it('returns nothing for an empty string', () => {
    expect(inlineMarkup('')).toEqual([]);
  });
});
