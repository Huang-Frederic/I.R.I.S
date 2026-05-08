import { describe, expect, it } from 'vitest';
import { categorizePricingCard } from './categorize-pricing-card';
import { makeCard as baseMakeCard } from './test-fixtures';
import type { Card } from '@/lib/types';

function makeCard(over: Partial<Card> = {}): Card {
  return baseMakeCard({
    id: 'card-1',
    card_name: 'Pikachu ex',
    card_id_tcg: 'sv2a-25',
    set_name: '151',
    set_code: 'sv2a',
    set_number: '025/165',
    rarity: 'AR',
    rarity_rank: 0,
    date_added: '2026-05-01T00:00:00Z',
    ...over,
  });
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
        makeCard({ card_id_tcg: null, set_code: 'sv2a', set_number: '025/165', language: 'EN' }),
      ),
    ).toBe('backfill');
  });

  it('does NOT skip JP/KO/CN/ZH (the Cardmarket dumps cover JP via the EN-translated set names; KO/CN miss is surfaced downstream)', () => {
    expect(categorizePricingCard(makeCard({ language: 'JP' }))).toBe('tcgdex');
    expect(categorizePricingCard(makeCard({ language: 'KO' }))).toBe('tcgdex');
    expect(categorizePricingCard(makeCard({ language: 'CN' }))).toBe('tcgdex');
    expect(categorizePricingCard(makeCard({ language: 'ZH' }))).toBe('tcgdex');
  });

  it('returns "skip" when set_code or set_number is missing (cannot lookup)', () => {
    expect(categorizePricingCard(makeCard({ card_id_tcg: null, set_code: null }))).toBe('skip');
    expect(categorizePricingCard(makeCard({ card_id_tcg: null, set_number: null }))).toBe('skip');
  });
});
