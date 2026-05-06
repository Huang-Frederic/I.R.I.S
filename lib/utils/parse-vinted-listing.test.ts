import { describe, expect, it } from 'vitest';
import { parseVintedListing } from './parse-vinted-listing';

describe('parseVintedListing', () => {
  it('extracts language/setCode/setNumber/condition from a typical JP listing', () => {
    const result = parseVintedListing({
      title: '✨ Carte Pokémon Archéodong - VMAX Climax (jpn_s8b-208)',
      description: '📘 Version Japonaise 🇯🇵\n✅ État : Très bon état (Near Mint), carte en excellent état (voir photos).',
    });
    expect(result).toEqual({
      language: 'JP',
      setCode: 's8b',
      setNumber: '208',
      condition: 'NM',
    });
  });

  it('matches when the (lang_set-num) pattern is in the description only', () => {
    const result = parseVintedListing({
      title: 'Pikachu rare',
      description: 'Carte (eng_swsh9-31) en parfait état',
    });
    expect(result?.language).toBe('EN');
    expect(result?.setCode).toBe('swsh9');
    expect(result?.setNumber).toBe('31');
  });

  it('matches when the pattern is in the title only', () => {
    const result = parseVintedListing({
      title: 'Pikachu (fra_sv1-25) NM',
      description: 'Vendue en l\'état',
    });
    expect(result?.language).toBe('FR');
  });

  it('handles lowercase chn_ language code', () => {
    const result = parseVintedListing({
      title: '(chn_sv2-100)',
      description: '',
    });
    expect(result?.language).toBe('CN');
  });

  it('returns null when no (lang_set-num) pattern matches', () => {
    expect(
      parseVintedListing({ title: 'Carte Pokémon rare', description: 'Pas de code ici' }),
    ).toBeNull();
  });

  it('defaults condition to NM when no condition keyword is present', () => {
    const result = parseVintedListing({
      title: '(jpn_s9-31)',
      description: 'Pas d\'info état',
    });
    expect(result?.condition).toBe('NM');
  });

  it('detects "Lightly played" → PL (LP collapsed into PL since no LP enum)', () => {
    const result = parseVintedListing({
      title: '(jpn_s9-31)',
      description: 'État: Lightly played, quelques marques visibles',
    });
    expect(result?.condition).toBe('PL');
  });

  it('detects "played" → PL', () => {
    const result = parseVintedListing({
      title: '(jpn_s9-31)',
      description: 'État: Played, usée',
    });
    expect(result?.condition).toBe('PL');
  });

  it('returns null when the language code is unknown (e.g. ger_)', () => {
    expect(
      parseVintedListing({ title: '(ger_sv1-25)', description: '' }),
    ).toBeNull();
  });

  it('falls back to title pattern (SET NUM) [LANG] when description is missing', () => {
    // What Vinted's wardrobe endpoint returns: title has the bracketed format,
    // description is empty/truncated.
    const result = parseVintedListing({
      title: 'Carte Pokémon Scalproie - Black Bolt (SV11B 148) [JP]',
      description: '',
    });
    expect(result).toEqual({
      language: 'JP',
      setCode: 'sv11b',
      setNumber: '148',
      condition: 'NM',
    });
  });

  it('title fallback handles 2-letter EN/FR/CN/KR codes', () => {
    expect(parseVintedListing({ title: '(SWSH9 31) [EN]', description: '' })?.language).toBe('EN');
    expect(parseVintedListing({ title: '(SV1 25) [FR]', description: '' })?.language).toBe('FR');
    expect(parseVintedListing({ title: '(SV2 100) [CN]', description: '' })?.language).toBe('CN');
    expect(parseVintedListing({ title: '(SV3 50) [KR]', description: '' })?.language).toBe('KO');
  });

  it('description pattern wins over title pattern when both are present', () => {
    // Title says EN, description says JP — the description form is more
    // authoritative because it's emitted by our own template generator.
    const result = parseVintedListing({
      title: 'Carte (SV11B 148) [EN]',
      description: '(jpn_sv11b-148)',
    });
    expect(result?.language).toBe('JP');
  });
});
