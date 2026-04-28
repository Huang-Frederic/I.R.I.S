import { describe, expect, it } from 'vitest';
import { mapLanguage, mapRarity, parseSetIndex } from './scrape-limitlesstcg';

describe('mapLanguage', () => {
  it('maps known LimitlessTCG codes to our enum', () => {
    expect(mapLanguage('jp')).toBe('JP');
    expect(mapLanguage('en')).toBe('EN');
    expect(mapLanguage('fr')).toBe('FR');
    expect(mapLanguage('pt')).toBe('PT');
  });

  it('returns null for unsupported codes (ko/zh not on LimitlessTCG)', () => {
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
