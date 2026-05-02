// lib/utils/lot-template.test.ts
import { describe, expect, it } from 'vitest';
import { buildLotAnnonce } from './lot-template';

const baseLot = {
  name: 'Lot Cartes Pokémon Art Set Complet',
  language: 'JP' as const,
  condition: 'NM' as const,
  extra_description: null,
};

describe('buildLotAnnonce', () => {
  it('returns the name as the title (no smart-truncate)', () => {
    const out = buildLotAnnonce(baseLot);
    expect(out.title).toBe('Lot Cartes Pokémon Art Set Complet');
  });

  it('preserves a name longer than 80 chars in the title (UI shows the warning)', () => {
    const long = 'A'.repeat(120);
    const out = buildLotAnnonce({ ...baseLot, name: long });
    expect(out.title).toBe(long);
    expect(out.title.length).toBe(120);
  });

  it('renders the description with the title, language and condition mapped', () => {
    const out = buildLotAnnonce(baseLot);
    expect(out.description).toContain('✨ Lot Cartes Pokémon Art Set Complet');
    expect(out.description).toContain('📘 Cartes officielles Japonaise 🇯🇵');
    expect(out.description).toContain('✅ État : Très bon état (Near Mint)');
  });

  it('omits the extra_block when extra_description is null', () => {
    const out = buildLotAnnonce(baseLot);
    // The line right after "État" should be the empty separator before the shipping block,
    // never an orphan paragraph from extra_description.
    expect(out.description).not.toMatch(/État.*\n.*\n.*\n.*\n🛡️/);
    expect(out.description).toMatch(/voir photos\)\.\n\n🛡️/);
  });

  it('inserts the extra_block when extra_description is provided', () => {
    const out = buildLotAnnonce({ ...baseLot, extra_description: 'Cartes triées une à une.' });
    expect(out.description).toMatch(/voir photos\)\.\n\nCartes triées une à une\.\n\n🛡️/);
  });

  it('trims whitespace around extra_description', () => {
    const out = buildLotAnnonce({ ...baseLot, extra_description: '   padded   ' });
    expect(out.description).toMatch(/voir photos\)\.\n\npadded\n\n🛡️/);
  });

  it('handles every CardLanguage value via the shared mapping', () => {
    const langs = ['JP', 'EN', 'FR', 'DE', 'IT', 'ES', 'KO', 'PT', 'ZH'] as const;
    for (const lang of langs) {
      const out = buildLotAnnonce({ ...baseLot, language: lang });
      expect(out.description).toContain('📘 Cartes officielles');
    }
  });
});
