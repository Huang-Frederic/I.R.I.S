import { describe, expect, it } from 'vitest';
import { passesStateChips, shouldHideForSalePile, passesMultiUserChip, type ChipState } from './vinted-filter';
import type { BaseListing } from '@/lib/types';

const NOW = new Date('2026-04-30T12:00:00Z').getTime();
const dayMs = 24 * 60 * 60 * 1000;
const isoDaysAgo = (d: number) => new Date(NOW - d * dayMs).toISOString();

const NONE: ChipState = {
  showOnline: false,
  showOffline: false,
  showStale: false,
  showSold: false,
};

const offline = null;
// Listing row with a known Vinted ID, posted 5 days ago (fresh).
const fresh: BaseListing = { user_id: 'u', listed_at: isoDaysAgo(5), vinted_listing_id: 'v-fresh', vinted_posted_at: isoDaysAgo(5) };
// Listing row with a known Vinted ID, posted 40 days ago (stale).
const stale: BaseListing = { user_id: 'u', listed_at: isoDaysAgo(40), vinted_listing_id: 'v-stale', vinted_posted_at: isoDaysAgo(40) };
// Listing row with no Vinted ID (ID lost after a failed repost).
// Should behave as "fresh online" — not offline, not stale (can't bump without ID).
const noId: BaseListing = { user_id: 'u', listed_at: isoDaysAgo(10), vinted_listing_id: null, vinted_posted_at: null };

describe('passesStateChips', () => {
  it('with no state chip active, every for_sale card passes', () => {
    expect(passesStateChips(offline, NONE, NOW)).toBe(true);
    expect(passesStateChips(fresh, NONE, NOW)).toBe(true);
    expect(passesStateChips(stale, NONE, NOW)).toBe(true);
  });

  it('showOnline alone includes ONLY fresh (not stale) — chips are mutually exclusive buckets', () => {
    const chips = { ...NONE, showOnline: true };
    expect(passesStateChips(offline, chips, NOW)).toBe(false);
    expect(passesStateChips(fresh, chips, NOW)).toBe(true);
    expect(passesStateChips(stale, chips, NOW)).toBe(false);
  });

  it('showOffline alone returns only offline cards', () => {
    const chips = { ...NONE, showOffline: true };
    expect(passesStateChips(offline, chips, NOW)).toBe(true);
    expect(passesStateChips(fresh, chips, NOW)).toBe(false);
    expect(passesStateChips(stale, chips, NOW)).toBe(false);
  });

  it('showStale alone returns only listed-over-21d cards', () => {
    const chips = { ...NONE, showStale: true };
    expect(passesStateChips(offline, chips, NOW)).toBe(false);
    expect(passesStateChips(fresh, chips, NOW)).toBe(false);
    expect(passesStateChips(stale, chips, NOW)).toBe(true);
  });

  it('listing row with null vinted_listing_id → treated as fresh (En ligne), never offline', () => {
    // ID was lost after a failed repost — item may still be on Vinted.
    // It should NOT appear in "Pas en ligne" (that means "never listed in IRIS").
    expect(passesStateChips(noId, { ...NONE, showOffline: true }, NOW)).toBe(false);
    expect(passesStateChips(noId, { ...NONE, showOnline: true }, NOW)).toBe(true);
    expect(passesStateChips(noId, { ...NONE, showStale: true }, NOW)).toBe(false);
  });

  it('En ligne + À rafraîchir = union of fresh-only and stale-only = all listed', () => {
    // Each chip owns exactly one bucket, so combining "fresh-only" with
    // "stale-only" gives "any listed", which is what the user wants.
    const chips = { ...NONE, showOnline: true, showStale: true };
    expect(passesStateChips(offline, chips, NOW)).toBe(false);
    expect(passesStateChips(fresh, chips, NOW)).toBe(true);
    expect(passesStateChips(stale, chips, NOW)).toBe(true);
  });

  it('Pas en ligne + À rafraîchir = "things to act on" view (offline + stale)', () => {
    const chips = { ...NONE, showOffline: true, showStale: true };
    expect(passesStateChips(offline, chips, NOW)).toBe(true);
    expect(passesStateChips(fresh, chips, NOW)).toBe(false);
    expect(passesStateChips(stale, chips, NOW)).toBe(true);
  });

  it('all three state chips active = every for_sale row passes', () => {
    const chips = { ...NONE, showOnline: true, showOffline: true, showStale: true };
    expect(passesStateChips(offline, chips, NOW)).toBe(true);
    expect(passesStateChips(fresh, chips, NOW)).toBe(true);
    expect(passesStateChips(stale, chips, NOW)).toBe(true);
  });

  it('showSold does not narrow for_sale on its own — gating happens via shouldHideForSalePile', () => {
    // showSold controls the separate sold-row pile and never gates for_sale
    // membership. With no other state chip active, the helper still falls
    // through to "Tous" — the caller is responsible for hiding the for_sale
    // pile via shouldHideForSalePile when showSold is the lone chip.
    const chips = { ...NONE, showSold: true };
    expect(passesStateChips(offline, chips, NOW)).toBe(true);
    expect(passesStateChips(fresh, chips, NOW)).toBe(true);
    expect(passesStateChips(stale, chips, NOW)).toBe(true);
  });
});

describe('shouldHideForSalePile', () => {
  it('returns false in the default "no chip" view', () => {
    expect(shouldHideForSalePile(NONE)).toBe(false);
  });

  it('returns true ONLY when showSold is the sole active state chip', () => {
    expect(shouldHideForSalePile({ ...NONE, showSold: true })).toBe(true);
  });

  it('returns false when showSold combines with any state chip', () => {
    expect(shouldHideForSalePile({ ...NONE, showSold: true, showOnline: true })).toBe(false);
    expect(shouldHideForSalePile({ ...NONE, showSold: true, showOffline: true })).toBe(false);
    expect(shouldHideForSalePile({ ...NONE, showSold: true, showStale: true })).toBe(false);
  });

  it('returns false when only state chips (no showSold) are active', () => {
    expect(shouldHideForSalePile({ ...NONE, showOnline: true })).toBe(false);
    expect(shouldHideForSalePile({ ...NONE, showStale: true })).toBe(false);
  });
});

const MY_ID = 'my-uuid';
const PARTNER_ID = 'partner-uuid';

interface FakeItem {
  status: string;
  listings: BaseListing[];
}

const BASE_L = { vinted_listing_id: null, vinted_posted_at: null };

const noListings: FakeItem = { status: 'for_sale', listings: [] };
const onlyMine: FakeItem = {
  status: 'for_sale',
  listings: [{ user_id: MY_ID, listed_at: '2026-05-01T00:00:00Z', ...BASE_L }],
};
const onlyPartner: FakeItem = {
  status: 'for_sale',
  listings: [{ user_id: PARTNER_ID, listed_at: '2026-04-15T00:00:00Z', ...BASE_L }],
};
const cross: FakeItem = {
  status: 'for_sale',
  listings: [
    { user_id: MY_ID, listed_at: '2026-05-01T00:00:00Z', ...BASE_L },
    { user_id: PARTNER_ID, listed_at: '2026-04-15T00:00:00Z', ...BASE_L },
  ],
};
const mineButSold: FakeItem = {
  status: 'sold',
  listings: [{ user_id: MY_ID, listed_at: '2026-05-01T00:00:00Z', ...BASE_L }],
};

describe('passesMultiUserChip', () => {
  it('chip "all" → always true', () => {
    expect(passesMultiUserChip(noListings, 'all', MY_ID, PARTNER_ID)).toBe(true);
    expect(passesMultiUserChip(onlyMine, 'all', MY_ID, PARTNER_ID)).toBe(true);
  });

  it('chip "mine" → true when I have a listing', () => {
    expect(passesMultiUserChip(onlyMine, 'mine', MY_ID, PARTNER_ID)).toBe(true);
    expect(passesMultiUserChip(onlyPartner, 'mine', MY_ID, PARTNER_ID)).toBe(false);
  });

  it('chip "partner" → true only when partner has a listing AND partnerUserId is set', () => {
    expect(passesMultiUserChip(onlyPartner, 'partner', MY_ID, PARTNER_ID)).toBe(true);
    expect(passesMultiUserChip(onlyMine, 'partner', MY_ID, PARTNER_ID)).toBe(false);
    expect(passesMultiUserChip(onlyPartner, 'partner', MY_ID, null)).toBe(false);
  });

  it('chip "cross" → true only when both have a listing', () => {
    expect(passesMultiUserChip(cross, 'cross', MY_ID, PARTNER_ID)).toBe(true);
    expect(passesMultiUserChip(onlyMine, 'cross', MY_ID, PARTNER_ID)).toBe(false);
    expect(passesMultiUserChip(onlyPartner, 'cross', MY_ID, PARTNER_ID)).toBe(false);
  });

  it('chip "none" → true only when nobody has a listing', () => {
    expect(passesMultiUserChip(noListings, 'none', MY_ID, PARTNER_ID)).toBe(true);
    expect(passesMultiUserChip(onlyMine, 'none', MY_ID, PARTNER_ID)).toBe(false);
  });

  it('chip "to_delete" → true when I have a listing AND status != for_sale', () => {
    expect(passesMultiUserChip(mineButSold, 'to_delete', MY_ID, PARTNER_ID)).toBe(true);
    expect(passesMultiUserChip(onlyMine, 'to_delete', MY_ID, PARTNER_ID)).toBe(false);
    expect(passesMultiUserChip(noListings, 'to_delete', MY_ID, PARTNER_ID)).toBe(false);
  });
});
