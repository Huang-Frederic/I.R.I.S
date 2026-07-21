import { describe, it, expect } from 'vitest';
import { filterEvents, citiesOf, INITIAL_EVENT_FILTERS } from './filter-events';
import type { StoreEventRow } from '@/lib/types';

function ev(overrides: Partial<StoreEventRow>): StoreEventRow {
  return {
    id: 'x', source: 's', shop_name: 'Boutique', city: 'Paris', title: 'Tournoi',
    event_type: 'tournament', starts_at: '2026-07-20T10:00:00.000Z', ends_at: null, url: 'https://x',
    price: null, external_id: 's:1', scraped_at: '2026-07-20T00:00:00.000Z', ...overrides,
  };
}

describe('filterEvents', () => {
  const events = [
    ev({ id: 'a', title: 'Avant-Première Nuit Noire', event_type: 'prerelease', city: 'Paris', shop_name: 'Gentlemen' }),
    ev({ id: 'b', title: 'Session de ligue', event_type: 'league', city: 'Lyon', shop_name: 'Loufoque' }),
    ev({ id: 'c', title: 'Tournoi Étendu', event_type: 'tournament', city: 'Paris', shop_name: 'Gentlemen' }),
  ];

  it('returns everything with the default filters', () => {
    expect(filterEvents(events, INITIAL_EVENT_FILTERS)).toHaveLength(3);
  });

  it('filters by event type', () => {
    expect(filterEvents(events, { ...INITIAL_EVENT_FILTERS, type: 'prerelease' }).map((e) => e.id)).toEqual(['a']);
  });

  it('filters by city', () => {
    expect(filterEvents(events, { ...INITIAL_EVENT_FILTERS, city: 'Lyon' }).map((e) => e.id)).toEqual(['b']);
  });

  it('searches title/shop/city, accent- and case-insensitively', () => {
    expect(filterEvents(events, { ...INITIAL_EVENT_FILTERS, search: 'etendu' }).map((e) => e.id)).toEqual(['c']);
    expect(filterEvents(events, { ...INITIAL_EVENT_FILTERS, search: 'loufoque' }).map((e) => e.id)).toEqual(['b']);
  });

  it('combines type + city + search with AND', () => {
    expect(filterEvents(events, { search: 'nuit', type: 'prerelease', city: 'Paris' }).map((e) => e.id)).toEqual(['a']);
    expect(filterEvents(events, { search: 'nuit', type: 'prerelease', city: 'Lyon' })).toHaveLength(0);
  });
});

describe('citiesOf', () => {
  it('returns distinct sorted cities', () => {
    const events = [ev({ city: 'Paris' }), ev({ city: 'Lyon' }), ev({ city: 'Paris' })];
    expect(citiesOf(events)).toEqual(['Lyon', 'Paris']);
  });
});
