import { describe, expect, it } from 'vitest';
import { categorizePricingCard } from './categorize-pricing-card';
import type { Card } from '@/lib/types';

function makeCard(over: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    pokemon_name: 'Pikachu',
    pokemon_number: 25,
    card_name: 'Pikachu ex',
    card_id_tcg: 'sv2a-25',
    set_name: '151',
    set_code: 'sv2a',
    set_number: '025/165',
    language: 'JP',
    rarity: 'AR',
    rarity_rank: 0,
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
    date_added: '2026-05-01T00:00:00Z',
    date_sold: null,
    sold_price: null,
    sold_by_user_id: null,
    notes: null,
    variant: null,
    ...over,
  };
}

describe('categorizePricingCard', () => {
  it('returns "tcgdex" when card_id_tcg is set and variant is null', () => {
    expect(categorizePricingCard(makeCard())).toBe('tcgdex');
  });

  it('returns "skip" when variant is not null (preserves manual variant prices)', () => {
    expect(categorizePricingCard(makeCard({ variant: 'pokeball' }))).toBe('skip');
    expect(categorizePricingCard(makeCard({ variant: 'reverse_holo' }))).toBe('skip');
  });

  it('returns "backfill" when card_id_tcg is null but set_code+set_number+language are valid', () => {
    expect(
      categorizePricingCard(
        makeCard({ card_id_tcg: null, set_code: 'sv2a', set_number: '025/165', language: 'JP' }),
      ),
    ).toBe('backfill');
  });

  it('returns "skip" for languages not catalogued by TCGdex (KO, ZH)', () => {
    expect(categorizePricingCard(makeCard({ language: 'KO' }))).toBe('skip');
    expect(categorizePricingCard(makeCard({ language: 'ZH' }))).toBe('skip');
  });

  it('returns "skip" when set_code or set_number is missing (cannot lookup)', () => {
    expect(categorizePricingCard(makeCard({ card_id_tcg: null, set_code: null }))).toBe('skip');
    expect(categorizePricingCard(makeCard({ card_id_tcg: null, set_number: null }))).toBe('skip');
  });
});
