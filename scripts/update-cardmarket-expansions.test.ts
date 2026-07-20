import { describe, expect, it } from 'vitest';
import {
  parseExpansionDropdown,
  diffNewExpansions,
  slugify,
  isFrLocalisation,
  buildScraperInput,
  normalize,
} from './update-cardmarket-expansions';

const DROPDOWN_HTML = `
<html><body>
  <select name="idExpansion">
    <option value="0">Toutes</option>
    <option value="1523">Set de Base</option>
    <option value="6633">Pitch Black</option>
    <option value="6640">Pitch Black Live</option>
    <option value="">vide</option>
    <option value="abc">bogus</option>
  </select>
  <select name="idRarity"><option value="99">SAR</option></select>
</body></html>`;

describe('parseExpansionDropdown', () => {
  it('extracts (id, name) pairs and skips the 0/empty/non-numeric options', () => {
    const parsed = parseExpansionDropdown(DROPDOWN_HTML);
    expect(parsed).toEqual([
      { idExpansion: 1523, name: 'Set de Base' },
      { idExpansion: 6633, name: 'Pitch Black' },
      { idExpansion: 6640, name: 'Pitch Black Live' },
    ]);
  });

  it('ignores other selects on the page', () => {
    const parsed = parseExpansionDropdown(DROPDOWN_HTML);
    expect(parsed.find((e) => e.idExpansion === 99)).toBeUndefined();
  });

  it('returns [] on a page without the dropdown', () => {
    expect(parseExpansionDropdown('<html><body>challenge page</body></html>')).toEqual([]);
  });
});

describe('diffNewExpansions', () => {
  it('returns only ids missing from the committed map, ascending', () => {
    const dropdown = [
      { idExpansion: 6640, name: 'Pitch Black Live' },
      { idExpansion: 1523, name: 'Set de Base' },
      { idExpansion: 6633, name: 'Pitch Black' },
    ];
    const committed = { '1523': 'Set de Base' };
    expect(diffNewExpansions(dropdown, committed)).toEqual([
      { idExpansion: 6633, name: 'Pitch Black' },
      { idExpansion: 6640, name: 'Pitch Black Live' },
    ]);
  });

  it('returns [] when everything is known', () => {
    const dropdown = [{ idExpansion: 1523, name: 'Set de Base' }];
    expect(diffNewExpansions(dropdown, { '1523': 'Set de Base' })).toEqual([]);
  });
});

describe('slugify', () => {
  it('matches the known Cardmarket URL slugs', () => {
    expect(slugify('Crown Zenith')).toBe('Crown-Zenith');
    expect(slugify("McDonald's Match Battle 2023")).toBe('McDonalds-Match-Battle-2023');
    expect(slugify('Pokémon Card 151')).toBe('Pokemon-Card-151');
    expect(slugify('ex Starter Set Sprigatito & Lucario ex')).toBe('ex-Starter-Set-Sprigatito-Lucario-ex');
  });
});

describe('isFrLocalisation', () => {
  it('flags sealed-product FR wrappers', () => {
    expect(isFrLocalisation('Produits Écarlate et Violet', 'Scarlet & Violet Products')).toBe(true);
    expect(isFrLocalisation('Académie de Combat', 'Battle Academy')).toBe(true);
  });

  it('keeps real expansions', () => {
    expect(isFrLocalisation('Pitch Black', 'Pitch Black')).toBe(false);
    expect(isFrLocalisation('Poing de Fusion', 'Fusion Strike')).toBe(false);
    expect(isFrLocalisation('Sans name_en', null)).toBe(false);
  });
});

describe('buildScraperInput', () => {
  it('wraps entries with the scraper defaults (skipExisting, perPage 30)', () => {
    const input = buildScraperInput([{ idExpansion: 6633, name: 'Pitch Black', slug: 'Pitch-Black' }]);
    expect(input.skipExisting).toBe(true);
    expect(input.perPage).toBe(30);
    expect(input.expansions).toHaveLength(1);
  });
});

describe('normalize', () => {
  it('lowercases, strips accents, collapses whitespace', () => {
    expect(normalize('  Zénith   Suprême ')).toBe('zenith supreme');
  });
});
