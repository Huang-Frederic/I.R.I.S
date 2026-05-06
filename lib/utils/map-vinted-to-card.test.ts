import { describe, expect, it } from 'vitest';
import type { VintedItem, ParsedListing } from '@/lib/types/vinted-import';
import type { EnrichedCard } from '@/lib/types';
import { mapVintedToCardInsert } from './map-vinted-to-card';

const VINTED_ITEM: VintedItem = {
  id: 1234,
  title: '✨ Carte Pokémon Archéodong - VMAX Climax (jpn_s8b-208)',
  description: '📘 Version Japonaise',
  price: { amount: '5.50', currency_code: 'EUR' },
  created_at_ts: 1_704_067_200, // 2024-01-01T00:00:00Z
  photos: [{ id: 1, full_size_url: 'https://images.vinted.net/full.jpg', url: 'https://images.vinted.net/thumb.jpg' }],
};

const PARSED: ParsedListing = {
  language: 'JP',
  setCode: 's8b',
  setNumber: '208',
  condition: 'NM',
};

const ENRICHED: EnrichedCard = {
  card_id_tcg: 's8b-208',
  card_name: 'Archéodong VMAX (アーケオドンVMAX)',
  pokemon_name: 'Archéodong (アーケオドン)',
  pokemon_number: 567,
  set_name: 'VMAX Climax',
  set_code: 's8b',
  set_number: '208/184',
  rarity: 'SAR',
  tcg_image_url: 'https://assets.tcgdex.net/foo.jpg',
  cardmarket_id: 'cm-123',
  cm_price_low: 4.5,
  cm_price_trend: 6.0,
  cm_price_avg: 5.2,
};

function assertRow<T>(value: T | { skipReason: string }): asserts value is T {
  if (value && typeof value === 'object' && 'skipReason' in value) {
    throw new Error(`expected row, got skipReason=${(value as { skipReason: string }).skipReason}`);
  }
}

describe('mapVintedToCardInsert', () => {
  it('uses enriched fields when an EnrichedCard is provided', () => {
    const result = mapVintedToCardInsert(VINTED_ITEM, PARSED, ENRICHED, 'https://supabase.co/storage/img.jpg');
    assertRow(result);
    expect(result.card_id_tcg).toBe('s8b-208');
    expect(result.set_number).toBe('208/184');
    expect(result.tcg_image_url).toBe('https://assets.tcgdex.net/foo.jpg');
    expect(result.cm_price_trend).toBe(6.0);
    expect(result.image_url).toBe('https://supabase.co/storage/img.jpg');
    expect(result.suggested_price).toBe(5.5);
    expect(result.status).toBe('for_sale');
    expect(result.language).toBe('JP');
    expect(result.condition).toBe('NM');
    expect(result.variant).toBeNull();
    expect(result.pokemon_number).toBe(567);
    expect(result.pokemon_name).toBe('Archéodong (アーケオドン)');
    expect(result.card_name).toBe('Archéodong VMAX (アーケオドンVMAX)');
    expect(result.rarity).toBe('SAR');
  });

  it('returns skipReason when enriched is null AND title has no Pokémon name (title fallback fails)', () => {
    // Title intentionally contains no Pokémon name → reverse-lookup returns null.
    const noName: VintedItem = { ...VINTED_ITEM, title: 'Trainer card energy lightning (jpn_s8b-208)' };
    const result = mapVintedToCardInsert(noName, PARSED, null, 'https://supabase.co/storage/img.jpg');
    expect(result).toEqual({ skipReason: 'enrich_missing_pokemon_number' });
  });

  it('returns skipReason when pokemon_number is out of range AND title has no Pokémon name', () => {
    const noName: VintedItem = { ...VINTED_ITEM, title: 'Trainer card energy lightning (jpn_s8b-208)' };
    const bad: EnrichedCard = { ...ENRICHED, pokemon_number: 9999 };
    const result = mapVintedToCardInsert(noName, PARSED, bad, '');
    expect(result).toEqual({ skipReason: 'enrich_missing_pokemon_number' });
  });

  it('falls back to extracting pokemon_number from the Vinted title (FR Pokémon name)', () => {
    // Catalog gave us a row with NULL pokemon_number (typical for JP cards
    // since the LimitlessTCG scraper never populated it). Helper should
    // recover by parsing "Archéodong" out of the title (= dex #784).
    const enrichedNoNumber: EnrichedCard = { ...ENRICHED, pokemon_number: null };
    const result = mapVintedToCardInsert(VINTED_ITEM, PARSED, enrichedNoNumber, '');
    if ('skipReason' in result) throw new Error(`expected row, got skip: ${result.skipReason}`);
    // Archéodong is dex 780. Verify a real number was filled (not null/0).
    expect(result.pokemon_number).toBeGreaterThan(0);
    expect(result.pokemon_number).toBeLessThanOrEqual(1025);
  });

  it('falls back to vinted title for card_name/pokemon_name when enriched is partial', () => {
    const partial: EnrichedCard = {
      ...ENRICHED,
      card_name: '',
      pokemon_name: '',
    };
    const result = mapVintedToCardInsert(VINTED_ITEM, PARSED, partial, '');
    assertRow(result);
    // Empty string is falsy → falls back to title
    expect(result.card_name).toBe(VINTED_ITEM.title);
    expect(result.pokemon_name).toBe(VINTED_ITEM.title);
  });

  it('parses price.amount as a number even when given as string', () => {
    const item = { ...VINTED_ITEM, price: { amount: '12.34', currency_code: 'EUR' } };
    const result = mapVintedToCardInsert(item, PARSED, ENRICHED, '');
    assertRow(result);
    expect(result.suggested_price).toBe(12.34);
  });

  it('does NOT include set_total in the output (column does not exist on cards table)', () => {
    const result = mapVintedToCardInsert(VINTED_ITEM, PARSED, ENRICHED, '');
    assertRow(result);
    expect('set_total' in result).toBe(false);
  });
});
