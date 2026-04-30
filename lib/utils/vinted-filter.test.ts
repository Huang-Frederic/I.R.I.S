import { describe, expect, it } from 'vitest';
import { passesStateChips, shouldHideForSalePile, type ChipState } from './vinted-filter';

const NOW = new Date('2026-04-30T12:00:00Z').getTime();
const dayMs = 24 * 60 * 60 * 1000;
const isoDaysAgo = (d: number) => new Date(NOW - d * dayMs).toISOString();

const NONE: ChipState = {
  showOnline: false,
  showOffline: false,
  showStale: false,
  showSold: false,
};

const offline = { vinted_listed_at: null };
const fresh = { vinted_listed_at: isoDaysAgo(5) };
const stale = { vinted_listed_at: isoDaysAgo(40) };

describe('passesStateChips', () => {
  it('with no state chip active, every for_sale card passes', () => {
    expect(passesStateChips(offline, NONE, NOW)).toBe(true);
    expect(passesStateChips(fresh, NONE, NOW)).toBe(true);
    expect(passesStateChips(stale, NONE, NOW)).toBe(true);
  });

  it('showOnline alone includes both fresh and stale (any age)', () => {
    const chips = { ...NONE, showOnline: true };
    expect(passesStateChips(offline, chips, NOW)).toBe(false);
    expect(passesStateChips(fresh, chips, NOW)).toBe(true);
    expect(passesStateChips(stale, chips, NOW)).toBe(true);
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

  it('En ligne + À rafraîchir is the bug-fix case: shows ALL online (stale subset of online)', () => {
    // The bug: previously showStale was a hard restriction, so combining it
    // with showOnline produced "online AND stale" = stale only. Users
    // expected the union "online OR stale" = all online (since stale is a
    // subset of online).
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
