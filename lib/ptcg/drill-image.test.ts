import { describe, expect, it } from 'vitest';
import { drillImageSrc } from './drill-image';

describe('drillImageSrc', () => {
  it('uses a catalog file as it is', () => {
    const url = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/PFL/PFL_083_R_FR_LG.png';
    expect(drillImageSrc(url)).toBe(url);
  });

  it('appends the size and format to a TCGdex asset', () => {
    expect(drillImageSrc('https://assets.tcgdex.net/fr/sv/sv10.5b/086')).toBe('https://assets.tcgdex.net/fr/sv/sv10.5b/086/low.webp');
  });

  it('keeps a file with a query string as it is', () => {
    expect(drillImageSrc('https://example.com/card.jpg?v=2')).toBe('https://example.com/card.jpg?v=2');
  });
});
