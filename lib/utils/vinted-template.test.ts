import { describe, expect, it } from 'vitest';
import { buildTitle, buildDescription, MAX_TITLE_LENGTH } from './vinted-template';
import type { Card } from '@/lib/types';

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    pokemon_name: 'Simiabraz',
    pokemon_number: 392,
    card_name: 'Simiabraz (ゴウカザル)',
    card_id_tcg: null,
    set_name: 'Mascarade Crépusculaire',
    set_code: 'SV5A',
    set_number: '70/167',
    language: 'JP',
    rarity: 'AR',
    rarity_rank: 8,
    condition: 'NM',
    status: 'for_sale',
    image_url: null,
    tcg_image_url: null,
    cardmarket_id: null,
    cm_price_low: null,
    cm_price_trend: null,
    cm_price_avg: null,
    suggested_price: null,
    cm_updated_at: null,
    lot_id: null,
    date_added: '2026-01-01T00:00:00Z',
    date_sold: null,
    sold_price: null,
    notes: null,
    variant: null,
    ...overrides,
  };
}

describe('buildTitle', () => {
  it('uses the user-specified format when within 80 chars', () => {
    const t = buildTitle(makeCard());
    expect(t).toBe('Carte Pokémon Simiabraz (ゴウカザル) - Mascarade Crépusculaire (SV5A 70) [JP]');
    expect(t.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
  });

  it('strips the denominator from set_number', () => {
    const t = buildTitle(makeCard());
    expect(t).toContain('SV5A 70');
    expect(t).not.toContain('70/167');
  });

  it('inserts variant before the set name when present', () => {
    const t = buildTitle(makeCard({ variant: 'pokeball' }));
    expect(t).toContain('Poké Ball - Mascarade');
    expect(t).toContain('[JP]');
  });

  it('drops the bilingual paren when full version overflows', () => {
    const card = makeCard({
      card_name: 'Très Long Nom (とても長い名前) ex',
      set_name: 'Un Set Au Nom Vraiment Long',
      variant: 'pokeball',
    });
    const t = buildTitle(card);
    expect(t.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
    expect(t).not.toContain('とても長い名前');
  });

  it('drops the variant before dropping the prefix', () => {
    // Crafted to overflow with variant but fit without it
    const card = makeCard({
      card_name: 'Charizard EX',
      set_name: 'Pokemon Card 151 Special Edition Long Set Name',
      variant: 'masterball',
    });
    const t = buildTitle(card);
    expect(t.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
  });

  it('always preserves card_name + language', () => {
    const card = makeCard({
      card_name: 'X Y Z',
      language: 'EN',
    });
    const t = buildTitle(card);
    expect(t).toContain('X Y Z');
    expect(t).toContain('[EN]');
  });

  it('omits the variant entirely when card has no variant', () => {
    const t = buildTitle(makeCard({ variant: null }));
    expect(t).not.toContain('Poké Ball');
    expect(t).not.toContain('Master Ball');
  });

  it('handles a card with no set_name (just set_code)', () => {
    const card = makeCard({ set_name: null, set_code: 'SV5A', set_number: '70/167' });
    const t = buildTitle(card);
    expect(t).toContain('(SV5A 70)');
    expect(t).not.toContain('Mascarade');
  });
});

describe('buildDescription', () => {
  it('matches the user-specified format for a typical JP card', () => {
    const d = buildDescription(makeCard());
    expect(d).toContain('✨ Carte Pokémon Simiabraz (ゴウカザル) - Mascarade Crépusculaire (SV5A 70) [JP]');
    expect(d).toContain('📘 Version Japonaise 🇯🇵');
    expect(d).toContain('✅ État : Très bon état (Near Mint).');
    expect(d).toContain('🛡️ Carte envoyée sous sleeve + toploader !');
    expect(d).toContain('🚀 Expédition rapide sous 1 à 2 jours ouvrés 📦');
    expect(d).toContain('🤝 Remise en main propre possible sur Paris / 92 / 95');
    expect(d).toContain('📸 Besoin de photos supplémentaires');
    expect(d).toContain('🃏 Plein d\'autres cartes sont disponibles sur mon profil');
    expect(d).toContain('📦 Possibilité de créer des lots personnalisés avec réduction sur les frais de port 🤑');
  });

  it('inserts the notes block when notes is non-empty', () => {
    const d = buildDescription(makeCard({ notes: 'Léger pli au coin' }));
    expect(d).toMatch(/\[Notes : Léger pli au coin\]/);
  });

  it('omits the notes block when notes is null or empty', () => {
    expect(buildDescription(makeCard({ notes: null }))).not.toMatch(/\[Notes/);
    expect(buildDescription(makeCard({ notes: '' }))).not.toMatch(/\[Notes/);
    expect(buildDescription(makeCard({ notes: '   ' }))).not.toMatch(/\[Notes/);
  });

  it('inserts the variant in the first line when present', () => {
    const d = buildDescription(makeCard({ variant: 'pokeball' }));
    expect(d).toContain('Simiabraz (ゴウカザル) Poké Ball - Mascarade');
  });

  it('uses the right language label for each language', () => {
    expect(buildDescription(makeCard({ language: 'EN' }))).toContain('Version Anglaise 🇬🇧');
    expect(buildDescription(makeCard({ language: 'FR' }))).toContain('Version Française 🇫🇷');
    expect(buildDescription(makeCard({ language: 'DE' }))).toContain('Version Allemande 🇩🇪');
  });

  it('uses the right condition label', () => {
    expect(buildDescription(makeCard({ condition: 'EX' }))).toContain('Excellent (EX)');
    expect(buildDescription(makeCard({ condition: 'GD' }))).toContain('Bon état (Good)');
  });
});
