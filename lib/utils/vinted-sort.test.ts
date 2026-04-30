import { describe, expect, it } from 'vitest';
import { sortVintedGroups } from './vinted-sort';
import type { Card } from '@/lib/types';
import type { CardGroup } from './group-cards';

const NOW = new Date('2026-04-30T12:00:00Z').getTime();
const dayMs = 24 * 60 * 60 * 1000;
const isoDaysAgo = (d: number) => new Date(NOW - d * dayMs).toISOString();

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
  it('places offline groups before listed groups', () => {
    const listed = makeGroup(makeCard({ id: 'a', vinted_listed_at: isoDaysAgo(2) }));
    const notListed = makeGroup(makeCard({ id: 'b', vinted_listed_at: null }));
    const sorted = sortVintedGroups([listed, notListed], NOW);
    expect(sorted[0].head.id).toBe('b');
    expect(sorted[1].head.id).toBe('a');
  });

  it('among offline groups, sorts by date_added ASC (oldest first)', () => {
    const oldest = makeGroup(makeCard({ id: 'a', date_added: '2026-01-01T00:00:00Z', vinted_listed_at: null }));
    const middle = makeGroup(makeCard({ id: 'b', date_added: '2026-02-01T00:00:00Z', vinted_listed_at: null }));
    const newest = makeGroup(makeCard({ id: 'c', date_added: '2026-03-01T00:00:00Z', vinted_listed_at: null }));
    const sorted = sortVintedGroups([newest, oldest, middle], NOW);
    expect(sorted.map((g) => g.head.id)).toEqual(['a', 'b', 'c']);
  });

  it('places stale groups (>21d listed) before fresh listed groups', () => {
    const fresh = makeGroup(makeCard({ id: 'fresh', vinted_listed_at: isoDaysAgo(5) }));
    const stale = makeGroup(makeCard({ id: 'stale', vinted_listed_at: isoDaysAgo(30) }));
    const sorted = sortVintedGroups([fresh, stale], NOW);
    expect(sorted.map((g) => g.head.id)).toEqual(['stale', 'fresh']);
  });

  it('among stale groups, sorts by vinted_listed_at ASC (most overdue first)', () => {
    const moderatelyStale = makeGroup(makeCard({ id: 'a', vinted_listed_at: isoDaysAgo(25) }));
    const veryStale = makeGroup(makeCard({ id: 'b', vinted_listed_at: isoDaysAgo(60) }));
    const ancientlyStale = makeGroup(makeCard({ id: 'c', vinted_listed_at: isoDaysAgo(120) }));
    const sorted = sortVintedGroups([moderatelyStale, ancientlyStale, veryStale], NOW);
    expect(sorted.map((g) => g.head.id)).toEqual(['c', 'b', 'a']);
  });

  it('among fresh listed groups, sorts by vinted_listed_at DESC (most recent first)', () => {
    const old = makeGroup(makeCard({ id: 'old', vinted_listed_at: isoDaysAgo(15) }));
    const recent = makeGroup(makeCard({ id: 'recent', vinted_listed_at: isoDaysAgo(2) }));
    const middle = makeGroup(makeCard({ id: 'middle', vinted_listed_at: isoDaysAgo(7) }));
    const sorted = sortVintedGroups([old, recent, middle], NOW);
    expect(sorted.map((g) => g.head.id)).toEqual(['recent', 'middle', 'old']);
  });

  it('full pipeline: offline (date ASC) → stale (oldest listing first) → fresh (newest first)', () => {
    const groups = [
      makeGroup(makeCard({ id: 'fresh-old', vinted_listed_at: isoDaysAgo(15) })),
      makeGroup(makeCard({ id: 'offline-new', date_added: '2026-03-01T00:00:00Z', vinted_listed_at: null })),
      makeGroup(makeCard({ id: 'stale-most', vinted_listed_at: isoDaysAgo(90) })),
      makeGroup(makeCard({ id: 'fresh-new', vinted_listed_at: isoDaysAgo(2) })),
      makeGroup(makeCard({ id: 'offline-old', date_added: '2026-01-01T00:00:00Z', vinted_listed_at: null })),
      makeGroup(makeCard({ id: 'stale-less', vinted_listed_at: isoDaysAgo(25) })),
    ];
    const sorted = sortVintedGroups(groups, NOW);
    expect(sorted.map((g) => g.head.id)).toEqual([
      'offline-old',  // bucket 0, ASC date_added
      'offline-new',
      'stale-most',   // bucket 1, ASC vinted_listed_at (most overdue first)
      'stale-less',
      'fresh-new',    // bucket 2, DESC vinted_listed_at (most recent first)
      'fresh-old',
    ]);
  });

  it('exactly-at-threshold (21 days) is treated as fresh, not stale', () => {
    // Mirror isListingStale's "MORE than 21 days" threshold so the boundary is
    // unambiguous and the two helpers stay aligned.
    const atThreshold = makeGroup(makeCard({ id: 'edge', vinted_listed_at: isoDaysAgo(21) }));
    const justOver = makeGroup(makeCard({ id: 'over', vinted_listed_at: isoDaysAgo(22) }));
    const sorted = sortVintedGroups([atThreshold, justOver], NOW);
    // Stale comes first; the 21-day card is fresh, so it should be after.
    expect(sorted.map((g) => g.head.id)).toEqual(['over', 'edge']);
  });

  it('returns a new array (does not mutate input)', () => {
    const a = makeGroup(makeCard({ id: 'a' }));
    const b = makeGroup(makeCard({ id: 'b' }));
    const input = [a, b];
    const sorted = sortVintedGroups(input, NOW);
    expect(sorted).not.toBe(input);
  });
});
