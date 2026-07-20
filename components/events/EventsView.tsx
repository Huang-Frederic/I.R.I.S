'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search, CalendarDays, List } from 'lucide-react';
import type { StoreEventRow, StoreEventType } from '@/lib/types';
import {
  filterEvents,
  citiesOf,
  INITIAL_EVENT_FILTERS,
  type EventFilterState,
} from '@/lib/utils/filter-events';
import EventRow from './EventRow';
import EventsCalendar from './EventsCalendar';
import ShopLegend from './ShopLegend';

const TYPES: Array<StoreEventType | 'all'> = [
  'all', 'prerelease', 'tournament', 'league_cup', 'league_challenge', 'league',
];

export default function EventsView({ events }: { events: StoreEventRow[] }) {
  const t = useTranslations('events');
  const [filters, setFilters] = useState<EventFilterState>(INITIAL_EVENT_FILTERS);
  const [view, setView] = useState<'calendar' | 'list'>('calendar');

  const cities = useMemo(() => citiesOf(events), [events]);
  const visible = useMemo(() => filterEvents(events, filters), [events, filters]);

  const typeLabel = (ty: StoreEventType | 'all') => (ty === 'all' ? t('filterAllTypes') : t(`type_${ty}`));

  if (events.length === 0) {
    return (
      <>
        <div className="bg-surface border-border rounded-lg border p-6">
          <p className="text-text-muted text-sm">{t('empty')}</p>
        </div>
        <ShopLegend events={events} />
      </>
    );
  }

  return (
    <div>
      <div className="bg-bg sticky top-0 z-10 -mx-4 mb-4 flex flex-col gap-3 px-4 py-3 md:mx-0 md:px-0">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[180px] flex-1">
            <Search className="text-text-faint pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" />
            <input
              type="search"
              placeholder={t('searchPlaceholder')}
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="bg-surface-2 border-border focus:border-red w-full rounded border py-1.5 pl-8 pr-3 text-sm outline-none"
            />
          </div>
          {cities.length > 1 && (
            <select
              value={filters.city}
              onChange={(e) => setFilters({ ...filters, city: e.target.value })}
              className="bg-surface-2 border-border rounded border px-3 py-1.5 text-sm"
              aria-label={t('filterCityAria')}
            >
              <option value="all">{t('filterAllCities')}</option>
              {cities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {/* View toggle */}
          <div className="bg-surface-2 border-border inline-flex shrink-0 rounded border p-0.5">
            <button
              type="button"
              onClick={() => setView('calendar')}
              aria-label={t('viewCalendar')}
              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs ${view === 'calendar' ? 'bg-red text-bg' : 'text-text-muted hover:text-text'}`}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('viewCalendar')}</span>
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              aria-label={t('viewList')}
              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs ${view === 'list' ? 'bg-red text-bg' : 'text-text-muted hover:text-text'}`}
            >
              <List className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('viewList')}</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {TYPES.map((ty) => (
            <button
              key={ty}
              type="button"
              onClick={() => setFilters({ ...filters, type: ty })}
              className={`rounded border px-2.5 py-1 text-xs transition-colors ${
                filters.type === ty
                  ? 'bg-red-bg border-red text-red font-medium'
                  : 'bg-surface-2 border-border text-text-muted hover:text-text'
              }`}
            >
              {typeLabel(ty)}
            </button>
          ))}
        </div>

        <p className="text-text-muted text-xs">{t('count', { visible: visible.length, total: events.length })}</p>
      </div>

      {view === 'calendar' ? (
        <EventsCalendar events={visible} />
      ) : visible.length === 0 ? (
        <div className="bg-surface border-border rounded-lg border p-6">
          <p className="text-text-muted text-sm">{t('emptyFiltered')}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((e) => <EventRow key={e.id} event={e} />)}
        </ul>
      )}

      <ShopLegend events={events} />
    </div>
  );
}
