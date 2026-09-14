import { describe, expect, it } from 'vitest';
import { formatLocalizedName, resolveLanguage } from './CardScanForm.helpers';

describe('resolveLanguage', () => {
  it('prefers the explicit Gemini language field', () => {
    expect(resolveLanguage({ language: 'FR', text: 'Salamèche' })).toBe('FR');
  });

  it('falls back to JP when CJK characters are present and no language field', () => {
    expect(resolveLanguage({ text: 'ゼニガメ' })).toBe('JP');
  });

  it('falls back to EN for latin text with no language field', () => {
    expect(resolveLanguage({ text: 'Squirtle' })).toBe('EN');
  });
});

describe('formatLocalizedName', () => {
  it('returns the raw name when there is no French name', () => {
    expect(formatLocalizedName(null, 'Squirtle', 'EN')).toBe('Squirtle');
  });

  it('returns the French name alone for FR cards', () => {
    expect(formatLocalizedName('Carapuce', 'Carapuce', 'FR')).toBe('Carapuce');
  });

  it('returns the French name alone when there is no raw name', () => {
    expect(formatLocalizedName('Carapuce', null, 'EN')).toBe('Carapuce');
  });

  it('appends the raw original in parentheses for non-FR cards', () => {
    expect(formatLocalizedName('Carapuce', 'Squirtle', 'EN')).toBe('Carapuce (Squirtle)');
  });

  it('does not double-wrap when the raw name is already embedded in the French name', () => {
    expect(formatLocalizedName('Meloetta ex (メロエッタex)', 'メロエッタex', 'JP')).toBe(
      'Meloetta ex (メロエッタex)',
    );
  });
});
