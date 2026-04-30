import { describe, expect, it } from 'vitest';
import { sortVintedGroups } from './vinted-sort';
import type { Card } from '@/lib/types';
import type { CardGroup } from './group-cards';

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    pokemon_name: 'Pikachu',
    pokemon_number: 25,
    card_name: 'Pikachu',
    card_id_tcg: 'sv1-100',
    set_name: null, set_code: null, set_number: null,
    language: 'JP', rarity: 'AR', rarity_rank: 8, condition: 'NM',
    status: 'for_sale',
    image_url: null, tcg_image_url: null,
    cardmarket_id: null, cm_price_low: null, cm_price_trend: null, cm_price_avg: null,
    suggested_price: null, cm_updated_at: null,
    lot_id: null,
    date_added: '2026-01-01T00:00:00Z',
    date_sold: null, sold_price: null,
    notes: null, variant: null,
    vinted_listed_at: null,
    ...overrides,
  };
}

function makeGroup(card: Card, position = 1): CardGroup {
  return {
    key: `${card.id}-key`,
    cards: [card],
    head: card,
    count: 1,
    position,
  };
}

describe('sortVintedGroups', () => {
  it('places not-listed groups before listed groups', () => {
    const listed = makeGroup(makeCard({ id: 'a', vinted_listed_at: '2026-03-01T00:00:00Z' }));
    const notListed = makeGroup(makeCard({ id: 'b', vinted_listed_at: null }));
    const sorted = sortVintedGroups([listed, notListed]);
    expect(sorted[0].head.id).toBe('b');
    expect(sorted[1].head.id).toBe('a');
  });

  it('among not-listed groups, sorts by date_added ASC (oldest first)', () => {
    const oldest = makeGroup(makeCard({ id: 'a', date_added: '2026-01-01T00:00:00Z', vinted_listed_at: null }));
    const middle = makeGroup(makeCard({ id: 'b', date_added: '2026-02-01T00:00:00Z', vinted_listed_at: null }));
    const newest = makeGroup(makeCard({ id: 'c', date_added: '2026-03-01T00:00:00Z', vinted_listed_at: null }));
    const sorted = sortVintedGroups([newest, oldest, middle]);
    expect(sorted.map((g) => g.head.id)).toEqual(['a', 'b', 'c']);
  });

  it('among listed groups, sorts by vinted_listed_at DESC (newest listing first)', () => {
    const oldListed = makeGroup(makeCard({ id: 'a', vinted_listed_at: '2026-01-01T00:00:00Z' }));
    const recentlyListed = makeGroup(makeCard({ id: 'b', vinted_listed_at: '2026-03-01T00:00:00Z' }));
    const middleListed = makeGroup(makeCard({ id: 'c', vinted_listed_at: '2026-02-01T00:00:00Z' }));
    const sorted = sortVintedGroups([oldListed, recentlyListed, middleListed]);
    expect(sorted.map((g) => g.head.id)).toEqual(['b', 'c', 'a']);
  });

  it('mixed: not-listed (date_added ASC) then listed (vinted_listed_at DESC)', () => {
    const groups = [
      makeGroup(makeCard({ id: 'listed-old', vinted_listed_at: '2026-01-01T00:00:00Z' })),
      makeGroup(makeCard({ id: 'not-listed-new', date_added: '2026-03-01T00:00:00Z', vinted_listed_at: null })),
      makeGroup(makeCard({ id: 'listed-new', vinted_listed_at: '2026-04-01T00:00:00Z' })),
      makeGroup(makeCard({ id: 'not-listed-old', date_added: '2026-01-01T00:00:00Z', vinted_listed_at: null })),
    ];
    const sorted = sortVintedGroups(groups);
    expect(sorted.map((g) => g.head.id)).toEqual([
      'not-listed-old',
      'not-listed-new',
      'listed-new',
      'listed-old',
    ]);
  });

  it('returns a new array (does not mutate input)', () => {
    const a = makeGroup(makeCard({ id: 'a' }));
    const b = makeGroup(makeCard({ id: 'b' }));
    const input = [a, b];
    const sorted = sortVintedGroups(input);
    expect(sorted).not.toBe(input);
  });
});
