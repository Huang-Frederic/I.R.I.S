import { describe, expect, it } from 'vitest';
import { interleaveCardsAndLots } from './vinted-interleave';
import {
  makeCardWithListings,
  makeGroup,
  makeLotWithListings,
  makeLotListing,
} from './test-fixtures';
import type { CardListing, CardWithListings, LotWithListings } from '@/lib/types';

const NOW = new Date('2026-04-30T12:00:00Z').getTime();
const dayMs = 24 * 60 * 60 * 1000;
const isoDaysAgo = (d: number) => new Date(NOW - d * dayMs).toISOString();
const MY_ID = 'my-user-id';

// Active Vinted listing: vinted_listing_id and vinted_posted_at must be set
// for bucketOf() to classify the item as stale or fresh (not offline).
const cardListing = (cardId: string, listedAt: string): CardListing => ({
  user_id: MY_ID,
  listed_at: listedAt,
  card_id: cardId,
  vinted_listing_id: `v-${cardId}`,
  vinted_posted_at: listedAt,
});

function makeCardGroup(overrides: Partial<CardWithListings> = {}) {
  return makeGroup(makeCardWithListings({ id: 'c-default', ...overrides }));
}

function makeLot(overrides: Partial<LotWithListings> = {}): LotWithListings {
  return makeLotWithListings({ id: 'l-default', ...overrides });
}

describe('interleaveCardsAndLots', () => {
  it('returns just cards when no lots', () => {
    const groups = [makeCardGroup({ id: 'a' }), makeCardGroup({ id: 'b' })];
    const out = interleaveCardsAndLots(groups, [], NOW, MY_ID);
    expect(out).toHaveLength(2);
    expect(out.every((row) => row.kind === 'card')).toBe(true);
  });

  it('returns just lots when no cards', () => {
    const lots = [makeLot({ id: 'l1' }), makeLot({ id: 'l2' })];
    const out = interleaveCardsAndLots([], lots, NOW, MY_ID);
    expect(out).toHaveLength(2);
    expect(out.every((row) => row.kind === 'lot')).toBe(true);
  });

  it('places offline rows (cards + lots) before any listed rows', () => {
    const offlineCard = makeCardGroup({ id: 'card-off', listings: [] });
    const offlineLot = makeLot({ id: 'lot-off', listings: [] });
    const listedCard = makeCardGroup({
      id: 'card-on',
      listings: [cardListing('card-id', isoDaysAgo(2))],
    });
    const listedLot = makeLot({
      id: 'lot-on',
      listings: [makeLotListing({ user_id: MY_ID, listed_at: isoDaysAgo(2) })],
    });
    const out = interleaveCardsAndLots(
      [listedCard, offlineCard],
      [listedLot, offlineLot],
      NOW,
      MY_ID,
    );
    const firstTwoIds = out.slice(0, 2).map((r) => (r.kind === 'card' ? r.group.head.id : r.lot.id));
    expect(new Set(firstTwoIds)).toEqual(new Set(['card-off', 'lot-off']));
  });

  it('within bucket 0 (offline), interleaves cards and lots by date_added ASC', () => {
    const cardOld = makeCardGroup({ id: 'c-old', date_added: '2026-01-01T00:00:00Z', listings: [] });
    const lotMid = makeLot({ id: 'l-mid', date_added: '2026-02-01T00:00:00Z', listings: [] });
    const cardNew = makeCardGroup({ id: 'c-new', date_added: '2026-03-01T00:00:00Z', listings: [] });
    const out = interleaveCardsAndLots([cardNew, cardOld], [lotMid], NOW, MY_ID);
    expect(out.map((r) => (r.kind === 'card' ? r.group.head.id : r.lot.id))).toEqual([
      'c-old',
      'l-mid',
      'c-new',
    ]);
  });

  it('within bucket 1 (stale), sorts both cards and lots by listed_at ASC', () => {
    const cardStale30 = makeCardGroup({
      id: 'c-30',
      listings: [cardListing('c-30', isoDaysAgo(30))],
    });
    const lotStale60 = makeLot({
      id: 'l-60',
      listings: [makeLotListing({ user_id: MY_ID, listed_at: isoDaysAgo(60), vinted_listing_id: 'v-l-60', vinted_posted_at: isoDaysAgo(60) })],
    });
    const cardStale90 = makeCardGroup({
      id: 'c-90',
      listings: [cardListing('c-90', isoDaysAgo(90))],
    });
    const out = interleaveCardsAndLots([cardStale30, cardStale90], [lotStale60], NOW, MY_ID);
    expect(out.map((r) => (r.kind === 'card' ? r.group.head.id : r.lot.id))).toEqual([
      'c-90',
      'l-60',
      'c-30',
    ]);
  });

  it('within bucket 2 (fresh), sorts both cards and lots by listed_at DESC', () => {
    const cardFresh2 = makeCardGroup({
      id: 'c-2',
      listings: [cardListing('c-2', isoDaysAgo(2))],
    });
    const lotFresh7 = makeLot({
      id: 'l-7',
      listings: [makeLotListing({ user_id: MY_ID, listed_at: isoDaysAgo(7), vinted_listing_id: 'v-l-7', vinted_posted_at: isoDaysAgo(7) })],
    });
    const cardFresh15 = makeCardGroup({
      id: 'c-15',
      listings: [cardListing('c-15', isoDaysAgo(15))],
    });
    const out = interleaveCardsAndLots([cardFresh2, cardFresh15], [lotFresh7], NOW, MY_ID);
    expect(out.map((r) => (r.kind === 'card' ? r.group.head.id : r.lot.id))).toEqual([
      'c-2',
      'l-7',
      'c-15',
    ]);
  });

  it('full pipeline: bucket 0 (date_added asc) -> bucket 1 (listed_at asc) -> bucket 2 (listed_at desc), cards+lots mixed', () => {
    const rows = {
      cardOfflineOld: makeCardGroup({ id: 'co-old', date_added: '2026-01-01T00:00:00Z', listings: [] }),
      lotOfflineNew: makeLot({ id: 'lo-new', date_added: '2026-03-01T00:00:00Z', listings: [] }),
      cardStale: makeCardGroup({
        id: 'cs',
        listings: [cardListing('cs', isoDaysAgo(50))],
      }),
      lotStale: makeLot({
        id: 'ls',
        listings: [makeLotListing({ user_id: MY_ID, listed_at: isoDaysAgo(80), vinted_listing_id: 'v-ls', vinted_posted_at: isoDaysAgo(80) })],
      }),
      cardFresh: makeCardGroup({
        id: 'cf',
        listings: [cardListing('cf', isoDaysAgo(2))],
      }),
      lotFresh: makeLot({
        id: 'lf',
        listings: [makeLotListing({ user_id: MY_ID, listed_at: isoDaysAgo(10), vinted_listing_id: 'v-lf', vinted_posted_at: isoDaysAgo(10) })],
      }),
    };
    const out = interleaveCardsAndLots(
      [rows.cardOfflineOld, rows.cardStale, rows.cardFresh],
      [rows.lotOfflineNew, rows.lotStale, rows.lotFresh],
      NOW,
      MY_ID,
    );
    expect(out.map((r) => (r.kind === 'card' ? r.group.head.id : r.lot.id))).toEqual([
      'co-old',
      'lo-new',
      'ls',
      'cs',
      'cf',
      'lf',
    ]);
  });

  it('does not mutate input arrays', () => {
    const groups = [makeCardGroup({ id: 'a' })];
    const lots = [makeLot({ id: 'l' })];
    const groupsCopy = [...groups];
    const lotsCopy = [...lots];
    interleaveCardsAndLots(groups, lots, NOW, MY_ID);
    expect(groups).toEqual(groupsCopy);
    expect(lots).toEqual(lotsCopy);
  });
});
