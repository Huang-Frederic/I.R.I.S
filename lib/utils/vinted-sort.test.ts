import { describe, expect, it } from 'vitest';
import { sortVintedGroups } from './vinted-sort';
import type { CardWithListings, CardListing } from '@/lib/types';
import type { CardGroup } from './group-cards';

const NOW = new Date('2026-04-30T12:00:00Z').getTime();
const dayMs = 24 * 60 * 60 * 1000;
const isoDaysAgo = (d: number) => new Date(NOW - d * dayMs).toISOString();
const MY_ID = 'my-user-id';

function makeCard(overrides: Partial<CardWithListings> = {}): CardWithListings {
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
    cardmarket_id: null, cardmarket_url: null, cm_price_low: null, cm_price_trend: null, cm_price_avg: null,
    suggested_price: null, cm_updated_at: null,
    lot_id: null,
    date_added: '2026-01-01T00:00:00Z',
    date_sold: null, sold_price: null, sold_by_user_id: null,
    notes: null, variant: null,
    listings: [],
    ...overrides,
  };
}

type CardGroupWithListings = Omit<CardGroup, 'head' | 'cards'> & {
  head: CardWithListings;
  cards: CardWithListings[];
};

function makeGroup(card: CardWithListings, position = 1): CardGroupWithListings {
  return {
    key: `${card.id}-key`,
    cards: [card],
    head: card,
    count: 1,
    position,
  };
}

const listing = (cardId: string, listedAt: string): CardListing => ({
  user_id: MY_ID,
  listed_at: listedAt,
  card_id: cardId,
});

describe('sortVintedGroups', () => {
  it('places offline groups before listed groups', () => {
    const listed = makeGroup(makeCard({ id: 'a', listings: [listing('card-id', isoDaysAgo(2))] }));
    const notListed = makeGroup(makeCard({ id: 'b', listings: [] }));
    const sorted = sortVintedGroups([listed, notListed], NOW, MY_ID);
    expect(sorted[0].head.id).toBe('b');
    expect(sorted[1].head.id).toBe('a');
  });

  it('among offline groups, sorts by date_added ASC (oldest first)', () => {
    const oldest = makeGroup(makeCard({ id: 'a', date_added: '2026-01-01T00:00:00Z', listings: [] }));
    const middle = makeGroup(makeCard({ id: 'b', date_added: '2026-02-01T00:00:00Z', listings: [] }));
    const newest = makeGroup(makeCard({ id: 'c', date_added: '2026-03-01T00:00:00Z', listings: [] }));
    const sorted = sortVintedGroups([newest, oldest, middle], NOW, MY_ID);
    expect(sorted.map((g) => g.head.id)).toEqual(['a', 'b', 'c']);
  });

  it('places stale groups (>21d listed) before fresh listed groups', () => {
    const fresh = makeGroup(makeCard({ id: 'fresh', listings: [listing('card-id', isoDaysAgo(5))] }));
    const stale = makeGroup(makeCard({ id: 'stale', listings: [listing('card-id', isoDaysAgo(30))] }));
    const sorted = sortVintedGroups([fresh, stale], NOW, MY_ID);
    expect(sorted.map((g) => g.head.id)).toEqual(['stale', 'fresh']);
  });

  it('among stale groups, sorts by listing.listed_at ASC (most overdue first)', () => {
    const moderatelyStale = makeGroup(makeCard({ id: 'a', listings: [listing('card-id', isoDaysAgo(25))] }));
    const veryStale = makeGroup(makeCard({ id: 'b', listings: [listing('card-id', isoDaysAgo(60))] }));
    const ancientlyStale = makeGroup(makeCard({ id: 'c', listings: [listing('card-id', isoDaysAgo(120))] }));
    const sorted = sortVintedGroups([moderatelyStale, ancientlyStale, veryStale], NOW, MY_ID);
    expect(sorted.map((g) => g.head.id)).toEqual(['c', 'b', 'a']);
  });

  it('among fresh listed groups, sorts by listing.listed_at DESC (most recent first)', () => {
    const old = makeGroup(makeCard({ id: 'old', listings: [listing('card-id', isoDaysAgo(15))] }));
    const recent = makeGroup(makeCard({ id: 'recent', listings: [listing('card-id', isoDaysAgo(2))] }));
    const middle = makeGroup(makeCard({ id: 'middle', listings: [listing('card-id', isoDaysAgo(7))] }));
    const sorted = sortVintedGroups([old, recent, middle], NOW, MY_ID);
    expect(sorted.map((g) => g.head.id)).toEqual(['recent', 'middle', 'old']);
  });

  it('full pipeline: offline (date ASC) → stale (oldest listing first) → fresh (newest first)', () => {
    const groups = [
      makeGroup(makeCard({ id: 'fresh-old', listings: [listing('card-id', isoDaysAgo(15))] })),
      makeGroup(makeCard({ id: 'offline-new', date_added: '2026-03-01T00:00:00Z', listings: [] })),
      makeGroup(makeCard({ id: 'stale-most', listings: [listing('card-id', isoDaysAgo(90))] })),
      makeGroup(makeCard({ id: 'fresh-new', listings: [listing('card-id', isoDaysAgo(2))] })),
      makeGroup(makeCard({ id: 'offline-old', date_added: '2026-01-01T00:00:00Z', listings: [] })),
      makeGroup(makeCard({ id: 'stale-less', listings: [listing('card-id', isoDaysAgo(25))] })),
    ];
    const sorted = sortVintedGroups(groups, NOW, MY_ID);
    expect(sorted.map((g) => g.head.id)).toEqual([
      'offline-old',  // bucket 0, ASC date_added
      'offline-new',
      'stale-most',   // bucket 1, ASC listing.listed_at (most overdue first)
      'stale-less',
      'fresh-new',    // bucket 2, DESC listing.listed_at (most recent first)
      'fresh-old',
    ]);
  });

  it('exactly-at-threshold (21 days) is treated as fresh, not stale', () => {
    // Mirror isListingStale's "MORE than 21 days" threshold so the boundary is
    // unambiguous and the two helpers stay aligned.
    const atThreshold = makeGroup(makeCard({ id: 'edge', listings: [listing('card-id', isoDaysAgo(21))] }));
    const justOver = makeGroup(makeCard({ id: 'over', listings: [listing('card-id', isoDaysAgo(22))] }));
    const sorted = sortVintedGroups([atThreshold, justOver], NOW, MY_ID);
    // Stale comes first; the 21-day card is fresh, so it should be after.
    expect(sorted.map((g) => g.head.id)).toEqual(['over', 'edge']);
  });

  it('returns a new array (does not mutate input)', () => {
    const a = makeGroup(makeCard({ id: 'a' }));
    const b = makeGroup(makeCard({ id: 'b' }));
    const input = [a, b];
    const sorted = sortVintedGroups(input, NOW, MY_ID);
    expect(sorted).not.toBe(input);
  });
});
