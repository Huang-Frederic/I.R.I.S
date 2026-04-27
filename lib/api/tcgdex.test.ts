import { describe, expect, it } from 'vitest';
import {
  extractPokemonName,
  mapRarity,
  toEnrichedCard,
  toTCGdexLang,
  type TCGdexCard,
} from './tcgdex';

describe('mapRarity (TCGdex vocabulary)', () => {
  it('maps the modern Scarlet & Violet rarity strings', () => {
    expect(mapRarity('Common')).toBe('C');
    expect(mapRarity('Uncommon')).toBe('UC');
    expect(mapRarity('Rare')).toBe('R');
    expect(mapRarity('Rare Holo')).toBe('R_HOLO');
    expect(mapRarity('Double rare')).toBe('RR');
    expect(mapRarity('Ultra Rare')).toBe('SR');
    expect(mapRarity('Illustration rare')).toBe('AR');
    expect(mapRarity('Special illustration rare')).toBe('SAR');
    expect(mapRarity('Hyper rare')).toBe('SAR');
  });

  it('falls back to OTHER for unknown or missing values', () => {
    expect(mapRarity(undefined)).toBe('OTHER');
    expect(mapRarity('')).toBe('OTHER');
    expect(mapRarity('Brand New Rarity 2030')).toBe('OTHER');
  });
});

describe('extractPokemonName', () => {
  it('strips suffixes on EN names', () => {
    expect(extractPokemonName('Charizard ex')).toBe('Charizard');
    expect(extractPokemonName('Mewtwo VMAX')).toBe('Mewtwo');
    expect(extractPokemonName('Arceus VSTAR')).toBe('Arceus');
  });

  it('leaves JP names untouched (no Latin suffix to strip)', () => {
    expect(extractPokemonName('ズルッグ')).toBe('ズルッグ');
    expect(extractPokemonName('リザードン')).toBe('リザードン');
  });
});

describe('toTCGdexLang', () => {
  it('maps every CardLanguage to a TCGdex catalog code', () => {
    expect(toTCGdexLang('JP')).toBe('ja');
    expect(toTCGdexLang('EN')).toBe('en');
    expect(toTCGdexLang('FR')).toBe('fr');
    expect(toTCGdexLang('DE')).toBe('de');
    expect(toTCGdexLang('IT')).toBe('it');
    expect(toTCGdexLang('ES')).toBe('es');
    expect(toTCGdexLang('KO')).toBe('ko');
    expect(toTCGdexLang('PT')).toBe('pt');
    expect(toTCGdexLang('ZH')).toBe('zh-tw');
  });
});

describe('toEnrichedCard', () => {
  function makeTCGdexCard(overrides: Partial<TCGdexCard> = {}): TCGdexCard {
    return {
      id: 'SV11W-136',
      localId: '136',
      name: 'ズルッグ',
      rarity: 'Illustration rare',
      hp: 70,
      dexId: [559],
      image: 'https://assets.tcgdex.net/ja/sv/SV11W/136',
      set: {
        id: 'SV11W',
        name: 'ホワイトフレア',
        cardCount: { official: 174, total: 200 },
      },
      pricing: {
        cardmarket: {
          updated: '2026-04-26T00:00:00Z',
          unit: 'EUR',
          idProduct: 999888,
          low: 2.5,
          trend: 4.2,
          avg: 4.0,
        },
      },
      ...overrides,
    };
  }

  it('flattens the JP Scraggy fixture into an EnrichedCard', () => {
    const out = toEnrichedCard(makeTCGdexCard());
    expect(out.card_id_tcg).toBe('SV11W-136');
    expect(out.card_name).toBe('ズルッグ');
    expect(out.pokemon_name).toBe('ズルッグ');
    expect(out.pokemon_number).toBe(559);
    expect(out.set_name).toBe('ホワイトフレア');
    expect(out.set_code).toBe('SV11W');
    expect(out.set_number).toBe('136/174');
    expect(out.rarity).toBe('AR');
    expect(out.tcg_image_url).toBe('https://assets.tcgdex.net/ja/sv/SV11W/136/high.png');
  });

  it('extracts Cardmarket pricing from the TCGdex payload', () => {
    const out = toEnrichedCard(makeTCGdexCard());
    expect(out.cardmarket_id).toBe('999888');
    expect(out.cm_price_low).toBe(2.5);
    expect(out.cm_price_trend).toBe(4.2);
    expect(out.cm_price_avg).toBe(4.0);
  });

  it('returns null pricing when TCGdex has no Cardmarket data', () => {
    const out = toEnrichedCard(makeTCGdexCard({ pricing: { cardmarket: null } }));
    expect(out.cardmarket_id).toBeNull();
    expect(out.cm_price_low).toBeNull();
    expect(out.cm_price_trend).toBeNull();
    expect(out.cm_price_avg).toBeNull();
  });

  it('falls back to total when official is missing for set_number denominator', () => {
    const out = toEnrichedCard(
      makeTCGdexCard({ set: { id: 'X', name: 'Y', cardCount: { total: 200 } } }),
    );
    expect(out.set_number).toBe('136/200');
  });

  it('uses just localId when no cardCount is available', () => {
    const out = toEnrichedCard(makeTCGdexCard({ set: { id: 'X', name: 'Y' } }));
    expect(out.set_number).toBe('136');
  });

  it('returns empty image URL when no image base is provided', () => {
    const out = toEnrichedCard(makeTCGdexCard({ image: undefined }));
    expect(out.tcg_image_url).toBe('');
  });
});
