import type { StoreEventRow, StoreEventType } from '@/lib/types';

export interface EventFilterState {
  search: string;
  type: StoreEventType | 'all';
  city: string | 'all';
}

export const INITIAL_EVENT_FILTERS: EventFilterState = { search: '', type: 'all', city: 'all' };

function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** Pure filter for the events list — search matches title/shop/city. */
export function filterEvents(events: StoreEventRow[], f: EventFilterState): StoreEventRow[] {
  const q = normalize(f.search.trim());
  return events.filter((e) => {
    if (f.type !== 'all' && e.event_type !== f.type) return false;
    if (f.city !== 'all' && e.city !== f.city) return false;
    if (q) {
      const hay = normalize(`${e.title} ${e.shop_name} ${e.city}`);
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Distinct cities present in the events, sorted — drives the city filter. */
export function citiesOf(events: StoreEventRow[]): string[] {
  return [...new Set(events.map((e) => e.city))].sort((a, b) => a.localeCompare(b));
}
