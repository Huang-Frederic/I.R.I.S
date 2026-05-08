import { describe, expect, it } from 'vitest';
import { buildLotAnnonce, composeLotTitle } from './lot-template';

const baseLot = {
  name: 'Art Set Complet Shiny Gem Pack Vol 1 - SBB1C',
  language: 'ZH' as const,
  condition: 'NM' as const,
  extra_description: null,
};

describe('composeLotTitle', () => {
  it('prepends "Lot de Cartes Pokémon " and appends [LANG_CODE]', () => {
    expect(composeLotTitle('Art Set SBB1C', 'ZH')).toBe('Lot de Cartes Pokémon Art Set SBB1C [CN]');
  });

  it('uses CN for ZH (user convention) and the enum value for other languages', () => {
    expect(composeLotTitle('Foo', 'ZH')).toContain('[CN]');
    expect(composeLotTitle('Foo', 'JP')).toContain('[JP]');
    expect(composeLotTitle('Foo', 'EN')).toContain('[EN]');
    expect(composeLotTitle('Foo', 'FR')).toContain('[FR]');
    expect(composeLotTitle('Foo', 'KO')).toContain('[KO]');
  });

  it('defaults to JP when language is null', () => {
    expect(composeLotTitle('Foo', null)).toBe('Lot de Cartes Pokémon Foo [JP]');
  });
});

describe('buildLotAnnonce', () => {
  it('returns the composed title (prefix + name + [code])', () => {
    const out = buildLotAnnonce(baseLot);
    expect(out.title).toBe('Lot de Cartes Pokémon Art Set Complet Shiny Gem Pack Vol 1 - SBB1C [CN]');
  });

  it('preserves a long name in the composed title (UI shows the warning)', () => {
    const long = 'A'.repeat(120);
    const out = buildLotAnnonce({ ...baseLot, name: long });
    expect(out.title.startsWith('Lot de Cartes Pokémon ')).toBe(true);
    expect(out.title.endsWith(' [CN]')).toBe(true);
    expect(out.title).toContain(long);
  });

  it('renders the description with the composed title, language and condition mapped', () => {
    const out = buildLotAnnonce(baseLot);
    expect(out.description).toContain('✨ Lot de Cartes Pokémon Art Set Complet Shiny Gem Pack Vol 1 - SBB1C [CN]');
    expect(out.description).toContain('📘 Cartes officielles Chinoise 🇨🇳');
    expect(out.description).toContain('✅ État : Très bon état (Near Mint)');
  });

  it('omits the extra_block when extra_description is null', () => {
    const out = buildLotAnnonce(baseLot);
    // No 📝 line should appear when extra_description is null.
    expect(out.description).not.toContain('📝');
    expect(out.description).toMatch(/voir photos\)\.\n\n🛡️/);
  });

  it('inserts the extra_block with 📝 emoji prefix when extra_description is provided', () => {
    const out = buildLotAnnonce({ ...baseLot, extra_description: 'Cartes triées une à une.' });
    expect(out.description).toMatch(/voir photos\)\.\n\n📝 Cartes triées une à une\.\n\n🛡️/);
  });

  it('trims whitespace around extra_description', () => {
    const out = buildLotAnnonce({ ...baseLot, extra_description: '   padded   ' });
    expect(out.description).toMatch(/voir photos\)\.\n\n📝 padded\n\n🛡️/);
  });

  it('handles every CardLanguage value via the shared mapping', () => {
    const langs = ['JP', 'EN', 'FR', 'DE', 'IT', 'ES', 'KO', 'PT', 'ZH'] as const;
    for (const lang of langs) {
      const out = buildLotAnnonce({ ...baseLot, language: lang });
      expect(out.description).toContain('📘 Cartes officielles');
    }
  });
});
