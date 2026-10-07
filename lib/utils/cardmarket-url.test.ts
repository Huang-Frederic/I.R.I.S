import { describe, expect, it } from 'vitest';
import { cardmarketUrlForLanguage } from './cardmarket-url';

const PRODUCT = 'https://www.cardmarket.com/fr/Pokemon/Products/Singles/XY/Venusaur-EX-XY1';

describe('cardmarketUrlForLanguage', () => {
  it('filters the offers to French for a French card', () => {
    expect(cardmarketUrlForLanguage(PRODUCT, 'FR')).toBe(`${PRODUCT}?language=2`);
  });

  it('keeps the parameters a search link already has', () => {
    const search = 'https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=Iron%20Treads%20ex';
    expect(cardmarketUrlForLanguage(search, 'FR')).toBe(`${search}&language=2`);
  });

  it('replaces a language already in the link instead of adding a second one', () => {
    expect(cardmarketUrlForLanguage(`${PRODUCT}?language=1`, 'FR')).toBe(`${PRODUCT}?language=2`);
  });

  it('leaves the other languages untouched', () => {
    expect(cardmarketUrlForLanguage(PRODUCT, 'JP')).toBe(PRODUCT);
    expect(cardmarketUrlForLanguage(PRODUCT, null)).toBe(PRODUCT);
  });

  it('passes a missing or unparsable link through', () => {
    expect(cardmarketUrlForLanguage(null, 'FR')).toBeNull();
    expect(cardmarketUrlForLanguage('not a url', 'FR')).toBe('not a url');
  });
});
