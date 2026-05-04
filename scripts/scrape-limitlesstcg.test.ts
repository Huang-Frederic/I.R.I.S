import { describe, expect, it } from 'vitest';
import { mapLanguage, mapRarity, parseIllustrator, parseSetIndex } from './scrape-limitlesstcg';

describe('mapLanguage', () => {
  it('maps actively-scraped LimitlessTCG codes (JP/EN/FR — user collection languages)', () => {
    expect(mapLanguage('jp')).toBe('JP');
    expect(mapLanguage('en')).toBe('EN');
    expect(mapLanguage('fr')).toBe('FR');
  });

  it('returns null for codes intentionally disabled (de/it/es/pt unused) or unsupported (ko/zh 404 on LimitlessTCG)', () => {
    expect(mapLanguage('de')).toBeNull();
    expect(mapLanguage('it')).toBeNull();
    expect(mapLanguage('es')).toBeNull();
    expect(mapLanguage('pt')).toBeNull();
    expect(mapLanguage('ko')).toBeNull();
    expect(mapLanguage('zh')).toBeNull();
    expect(mapLanguage('ru')).toBeNull();
  });
});

describe('mapRarity', () => {
  it('maps modern rarities (observed in SV-era)', () => {
    expect(mapRarity('Common')).toBe('C');
    expect(mapRarity('Uncommon')).toBe('UC');
    expect(mapRarity('Rare')).toBe('R');
    expect(mapRarity('Double Rare')).toBe('RR');
    expect(mapRarity('Ultra Rare')).toBe('SR');
    expect(mapRarity('Art Rare')).toBe('AR');
    expect(mapRarity('Special Art Rare')).toBe('SAR');
    expect(mapRarity('Secret Rare')).toBe('SAR');
  });

  it('maps older / specialty rarities', () => {
    expect(mapRarity('Rare Holo')).toBe('R_HOLO');
    expect(mapRarity('Trainer Gallery Holo Rare')).toBe('CHR');
  });

  it('falls back to OTHER for null or unknown', () => {
    expect(mapRarity(null)).toBe('OTHER');
    expect(mapRarity('Mystery Mythic Rare')).toBe('OTHER');
  });
});

describe('parseSetIndex', () => {
  it('extracts unique set codes from a set index page', () => {
    const html = `
      <a href="/cards/jp/SV11W">SV11W</a>
      <a href="/cards/jp/SV11W">SV11W (link 2)</a>
      <a href="/cards/jp/BW5n">BW5n</a>
      <a href="/cards/jp/BW5n/1">card 1</a>
      <a href="/cards/en/SV01">EN set (different lang, ignored)</a>
    `;
    expect(parseSetIndex(html, 'jp')).toEqual(['BW5n', 'SV11W']);
  });

  it('returns empty array when no sets match', () => {
    expect(parseSetIndex('<p>nothing here</p>', 'jp')).toEqual([]);
  });

  it('handles set codes with dots and hyphens (some sets have these)', () => {
    const html = `<a href="/cards/jp/sm3.5">SM3.5</a><a href="/cards/jp/swsh-promos">promos</a>`;
    expect(parseSetIndex(html, 'jp')).toEqual(['sm3.5', 'swsh-promos']);
  });
});

describe('parseIllustrator', () => {
  it('extracts the artist name from a real LimitlessTCG card page (with /{lang} URL prefix)', () => {
    // Verbatim from https://limitlesstcg.com/cards/jp/20th/1
    const html = `
            Illustrated by
            <a href="/cards/jp?q=!artist:eske_yoshinob">
                Eske Yoshinob
            </a>
        </div>
    `;
    expect(parseIllustrator(html)).toBe('Eske Yoshinob');
  });

  it('also accepts the legacy/admin URL shape without /{lang}', () => {
    const html = `Illustrated by <a href="/cards?q=!artist:nisimono">nisimono</a>`;
    expect(parseIllustrator(html)).toBe('nisimono');
  });

  it('extracts artist with spaces and unicode characters', () => {
    const html = `Illustrated by <a href="/cards/en?q=!artist:Ryuta%20Fuse">Ryuta Fuse</a>`;
    expect(parseIllustrator(html)).toBe('Ryuta Fuse');
  });

  it('handles Japanese illustrator names', () => {
    const html = `Illustrated by <a href="/cards/jp?q=!artist:YASHIRO">YASHIRO Nanaco</a>`;
    expect(parseIllustrator(html)).toBe('YASHIRO Nanaco');
  });

  it('returns null when no illustrator credit is present', () => {
    const html = `<p>Some other content</p><p>HP 110</p>`;
    expect(parseIllustrator(html)).toBeNull();
  });
});
