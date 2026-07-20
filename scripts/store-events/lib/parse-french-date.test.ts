import { describe, it, expect } from 'vitest';
import { parseFrenchDate } from './parse-french-date';

// Fixed reference so year-inference and the tests never rot.
const NOW = new Date('2026-07-20T12:00:00Z');

describe('parseFrenchDate', () => {
  it('parses "day-name DD Month YYYY"', () => {
    expect(parseFrenchDate('Célébration de mi-année - Jeudi 23 Juillet 2026', NOW))
      .toBe('2026-07-23T00:00:00.000Z');
  });

  it('parses "DD month YYYY" ignoring an unrelated number ("24 joueurs")', () => {
    expect(parseFrenchDate('Circuit Illumis - Tournoi Etendu - 24 joueurs - 19 juillet 2026', NOW))
      .toBe('2026-07-19T00:00:00.000Z');
  });

  it('parses DD/MM/YYYY with a "à HHhMM" time', () => {
    expect(parseFrenchDate('Session de ligue - Jeudi 02/07/2026 à 18h30', NOW))
      .toBe('2026-07-02T18:30:00.000Z');
  });

  it('parses DD/MM without a year and infers the year + HHh time', () => {
    // 11/07 seen on 2026-07-20 → this year (recent, within 60 days).
    expect(parseFrenchDate('Avant-Première Pokémon ME05 : Nuit Noire (11/07 à 20h) - Gambetta', NOW))
      .toBe('2026-07-11T20:00:00.000Z');
  });

  it('parses "day-name D Month" without a year and infers it', () => {
    // "Dimanche 7 Juin" seen on 2026-07-20 → 7 Jun 2026 is only ~6 weeks back → this year.
    expect(parseFrenchDate('Tournoi Etendu - Circuit Illumis - Dimanche 7 Juin à 10h', NOW))
      .toBe('2026-06-07T10:00:00.000Z');
  });

  it('rolls a long-past dateless day to next year', () => {
    // "3 janvier" seen on 2026-07-20 is >60 days behind → next year.
    expect(parseFrenchDate('Tournoi - 3 janvier à 14h', NOW))
      .toBe('2027-01-03T14:00:00.000Z');
  });

  it('handles accented and unaccented month spellings', () => {
    expect(parseFrenchDate('Prerelease - 15 février 2027', NOW)).toBe('2027-02-15T00:00:00.000Z');
    expect(parseFrenchDate('Prerelease - 15 fevrier 2027', NOW)).toBe('2027-02-15T00:00:00.000Z');
    expect(parseFrenchDate('Session - 20 aout 2026', NOW)).toBe('2026-08-20T00:00:00.000Z');
  });

  it('returns null when there is no date', () => {
    expect(parseFrenchDate('Session de ligue hebdomadaire', NOW)).toBeNull();
    expect(parseFrenchDate('', NOW)).toBeNull();
  });

  it('rejects an impossible date', () => {
    expect(parseFrenchDate('31/02/2026', NOW)).toBeNull();
  });
});
