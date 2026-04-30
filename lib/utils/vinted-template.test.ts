// lib/utils/vinted-template.test.ts
import { describe, expect, it } from 'vitest';
import { buildTitle, buildDescription, MAX_TITLE_LENGTH } from './vinted-template';
import type { Card } from '@/lib/types';

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    pokemon_name: 'Pikachu (ピカチュウ)',
    pokemon_number: 25,
    card_name: 'Pikachu ex',
    card_id_tcg: null,
    set_name: 'Combat de Maîtres',
    set_code: 'sv11',
    set_number: '120/180',
    language: 'JP',
    rarity: 'SAR',
    rarity_rank: 9,
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

const CONFIG = {
  vinted_shipping_note: 'Expédition soignée en toploader.',
  vinted_seller_note: 'Vendeur sérieux.',
};

describe('buildTitle', () => {
  it('emits the full bilingual format when it fits', () => {
    const t = buildTitle(
      makeCard({ card_name: 'Pikachu (ピカチュウ) ex', condition: 'EX' }),
    );
    expect(t).toContain('Pikachu');
    expect(t).toContain('ピカチュウ');
    expect(t).toContain('SAR');
    expect(t).toContain('JP');
    expect(t).toContain('EX');
    expect(t.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
  });

  it('drops the bilingual paren when the full version overflows', () => {
    const card = makeCard({
      card_name: 'Très Long Nom de Carte (とても長いカード名前) ex',
      set_name: 'Un Set Au Nom Vraiment Long',
      variant: 'pokeball',
      condition: 'EX',
    });
    const t = buildTitle(card);
    expect(t.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
    expect(t).not.toContain('とても長いカード名前');
    expect(t).toContain('Très Long Nom');
  });

  it('drops condition when it is the implicit default NM', () => {
    const card = makeCard({
      card_name: 'Très Long Nom de Carte (とても長いカード名前) ex',
      set_name: 'Un Set Au Nom Vraiment Long',
      variant: 'pokeball',
      condition: 'NM',
    });
    const t = buildTitle(card);
    expect(t).not.toMatch(/—\s*NM\s*$/);
  });

  it('keeps non-NM condition even after truncation', () => {
    const card = makeCard({
      card_name: 'Aaaaa Bbbbb Ccccc Ddddd Eeeee Fffff Ggggg Hhhhh ex',
      set_name: 'Aaaaa Bbbbb Ccccc',
      variant: 'pokeball',
      condition: 'EX',
    });
    const t = buildTitle(card);
    expect(t).toContain('EX');
    expect(t.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
  });

  it('falls back to set_code when set_name is too long', () => {
    const card = makeCard({
      card_name: 'Long Card Name Here Pikachu ex',
      set_name: 'A Very Very Very Very Long Set Name',
      variant: 'pokeball',
      condition: 'EX',
    });
    const t = buildTitle(card);
    expect(t.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
    expect(t).not.toContain('A Very Very Very Very');
  });

  it('drops the set entirely when even set_code does not fit', () => {
    const card = makeCard({
      card_name: 'Aaaaaaa Bbbbbbb Ccccccc Ddddddd Eeeeeee Fffffff Pikachu ex',
      set_name: 'Set Name',
      set_code: 'sv11',
      variant: 'pokeball',
      condition: 'EX',
    });
    const t = buildTitle(card);
    expect(t.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
    expect(t).toContain('Pikachu ex');
    expect(t).toContain('SAR');
    expect(t).toContain('JP');
    expect(t).toContain('Poké Ball');
  });

  it('always preserves card_name + rarity + language', () => {
    const card = makeCard({
      card_name: 'X',
      rarity: 'AR',
      language: 'EN',
      variant: null,
    });
    const t = buildTitle(card);
    expect(t).toContain('X');
    expect(t).toContain('AR');
    expect(t).toContain('EN');
  });

  it('omits the variant chip when variant is null', () => {
    const t = buildTitle(makeCard({ variant: null, condition: 'EX' }));
    expect(t).not.toContain('Poké Ball');
    expect(t).not.toContain('Master Ball');
  });
});

describe('buildDescription', () => {
  it('includes all sections by default', () => {
    const d = buildDescription(makeCard(), CONFIG);
    expect(d).toContain('Pikachu ex');
    expect(d).toContain('Special Art Rare');
    expect(d).toContain('Combat de Maîtres');
    expect(d).toContain('sv11');
    expect(d).toContain('120/180');
    expect(d).toContain('Japonais');
    expect(d).toContain('Near Mint');
    expect(d).toContain('Expédition soignée');
    expect(d).toContain('Vendeur sérieux');
  });

  it('adds a variant line only when variant is present', () => {
    const without = buildDescription(makeCard({ variant: null }), CONFIG);
    expect(without).not.toMatch(/Variant/);
    const withVariant = buildDescription(
      makeCard({ variant: 'masterball' }),
      CONFIG,
    );
    expect(withVariant).toMatch(/Variant.*Master Ball/);
  });

  it('omits the set_number suffix when set_number is null', () => {
    const d = buildDescription(makeCard({ set_number: null }), CONFIG);
    expect(d).not.toMatch(/N°/);
  });
});
