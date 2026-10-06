import { describe, expect, it } from 'vitest';
import { vintedTitle } from './vinted-title';

// Mirrors vinted-agent/titles_test.py — the fiche must preview the title the bot sends.
describe('vintedTitle', () => {
  it('collapses tabs and repeated spaces', () => {
    expect(vintedTitle('Carte Magic Final Fantasy\tSephiroth, Fabled SOLDIER\t115\tM [FR]')).toBe(
      'Carte Magic Final Fantasy Sephiroth, Fabled Soldier 115 M [FR]',
    );
    expect(vintedTitle('  Lot   de\ncartes  ')).toBe('Lot de cartes');
  });

  it('lowers all-caps words of four letters or more', () => {
    expect(vintedTitle('Imperméable RAINS Unisex Long Jacket')).toBe('Imperméable Rains Unisex Long Jacket');
    expect(vintedTitle('Pikachu VMAX')).toBe('Pikachu Vmax');
    expect(vintedTitle('ÉDITION LIMITÉE')).toBe('Édition Limitée');
  });

  it('keeps short codes, set codes and the language tag', () => {
    expect(vintedTitle('Carte Pokémon Dracaufeu EX - (XYP 17) [FR]')).toBe('Carte Pokémon Dracaufeu EX - (XYP 17) [FR]');
    expect(vintedTitle('Aquali Stamp - Gem Pack Vol. 2 (CBB2C 2) [CN]')).toBe('Aquali Stamp - Gem Pack Vol. 2 (CBB2C 2) [CN]');
    expect(vintedTitle('Nike Dunk Low Retro SE')).toBe('Nike Dunk Low Retro SE');
  });

  it('is idempotent', () => {
    const once = vintedTitle('Carte Magic SOLDIER\tVSTAR [FR]');
    expect(vintedTitle(once)).toBe(once);
  });
});
