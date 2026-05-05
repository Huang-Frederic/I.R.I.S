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

describe('mapVintedToCardInsert', () => {
  it('uses enriched fields when an EnrichedCard is provided', () => {
    const enriched: EnrichedCard = {
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

    const row = mapVintedToCardInsert(VINTED_ITEM, PARSED, enriched, 'https://supabase.co/storage/img.jpg');
    expect(row.card_id_tcg).toBe('s8b-208');
    expect(row.set_number).toBe('208/184');
    expect(row.tcg_image_url).toBe('https://assets.tcgdex.net/foo.jpg');
    expect(row.cm_price_trend).toBe(6.0);
    expect(row.image_url).toBe('https://supabase.co/storage/img.jpg');
    expect(row.suggested_price).toBe(5.5);
    expect(row.status).toBe('for_sale');
    expect(row.language).toBe('JP');
    expect(row.condition).toBe('NM');
    expect(row.variant).toBeNull();
  });

  it('falls back to parsed fields when enriched is null', () => {
    const row = mapVintedToCardInsert(VINTED_ITEM, PARSED, null, 'https://supabase.co/storage/img.jpg');
    expect(row.card_id_tcg).toBeNull();
    expect(row.set_code).toBe('s8b');
    expect(row.set_number).toBe('208');
    expect(row.tcg_image_url).toBeNull();
    expect(row.cm_price_trend).toBeNull();
    expect(row.cardmarket_id).toBeNull();
    expect(row.suggested_price).toBe(5.5);
  });

  it('parses price.amount as a number even when given as string', () => {
    const item = { ...VINTED_ITEM, price: { amount: '12.34', currency_code: 'EUR' } };
    const row = mapVintedToCardInsert(item, PARSED, null, '');
    expect(row.suggested_price).toBe(12.34);
  });
});
