// lib/utils/group-cards.test.ts
import { describe, expect, it } from 'vitest';
import { groupKey, groupCards } from './group-cards';
import type { Card } from '@/lib/types';

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    pokemon_name: 'Pikachu',
    pokemon_number: 25,
    card_name: 'Pikachu',
    card_id_tcg: 'sv1-100',
    set_name: 'Scarlet & Violet',
    set_code: 'sv1',
    set_number: '100/198',
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
    sold_by_user_id: null,
    notes: null,
    variant: null,
    ...overrides,
  };
}

describe('groupKey', () => {
  it('uses card_id_tcg + language + condition + variant', () => {
    const a = makeCard();
    const b = makeCard({ id: 'c2' });
    expect(groupKey(a)).toBe(groupKey(b));
  });

  it('separates standard vs Poké Ball variant', () => {
    const standard = makeCard({ variant: null });
    const pokeball = makeCard({ variant: 'pokeball' });
    expect(groupKey(standard)).not.toBe(groupKey(pokeball));
  });

  it('separates two languages', () => {
    expect(groupKey(makeCard({ language: 'JP' }))).not.toBe(
      groupKey(makeCard({ language: 'EN' })),
    );
  });

  it('falls back to pokemon_number+set_code+set_number when card_id_tcg is null', () => {
    const a = makeCard({ card_id_tcg: null });
    const b = makeCard({ id: 'c2', card_id_tcg: null });
    expect(groupKey(a)).toBe(groupKey(b));
    const c = makeCard({ card_id_tcg: null, set_number: '101/198' });
    expect(groupKey(a)).not.toBe(groupKey(c));
  });
});

describe('groupCards', () => {
  it('returns one group per unique key, sorted by head date_added ASC', () => {
    const old = makeCard({ id: 'old', date_added: '2026-01-01T00:00:00Z' });
    const newer = makeCard({ id: 'newer', date_added: '2026-02-01T00:00:00Z' });
    const groups = groupCards([newer, old]);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
    expect(groups[0].head.id).toBe('old'); // FIFO inside the group
    expect(groups[0].position).toBe(1);
  });

  it('assigns FIFO position #1, #2, ... across groups', () => {
    const a = makeCard({ id: 'a', language: 'JP', date_added: '2026-01-01T00:00:00Z' });
    const b = makeCard({ id: 'b', language: 'EN', date_added: '2026-02-01T00:00:00Z' });
    const groups = groupCards([b, a]);
    expect(groups[0].head.id).toBe('a');
    expect(groups[0].position).toBe(1);
    expect(groups[1].head.id).toBe('b');
    expect(groups[1].position).toBe(2);
  });

  it('keeps within-group cards sorted FIFO', () => {
    const c1 = makeCard({ id: 'c1', date_added: '2026-01-01T00:00:00Z' });
    const c2 = makeCard({ id: 'c2', date_added: '2026-02-01T00:00:00Z' });
    const c3 = makeCard({ id: 'c3', date_added: '2026-03-01T00:00:00Z' });
    const groups = groupCards([c3, c1, c2]);
    expect(groups[0].cards.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('picks the for_sale card as head over an older sold card', () => {
    // Scenario: partner already sold the original (Card1), I promoted my
    // stock copy (Card2). The for_sale row should drive what the user sees.
    const oldSold = makeCard({ id: 'old-sold', status: 'sold', date_added: '2026-01-01T00:00:00Z' });
    const newForSale = makeCard({ id: 'new-fs', status: 'for_sale', date_added: '2026-02-01T00:00:00Z' });
    const groups = groupCards([oldSold, newForSale]);
    expect(groups).toHaveLength(1);
    expect(groups[0].head.id).toBe('new-fs');
    // Count excludes the historical sold card so the row doesn't display "x2".
    expect(groups[0].count).toBe(1);
  });

  it('count excludes sold rows but keeps active stock copies', () => {
    const sold = makeCard({ id: 'sold', status: 'sold', date_added: '2026-01-01T00:00:00Z' });
    const stock1 = makeCard({ id: 'stock1', status: 'collection', date_added: '2026-02-01T00:00:00Z' });
    const stock2 = makeCard({ id: 'stock2', status: 'collection', date_added: '2026-03-01T00:00:00Z' });
    const groups = groupCards([sold, stock1, stock2]);
    expect(groups[0].count).toBe(2);
  });
});
