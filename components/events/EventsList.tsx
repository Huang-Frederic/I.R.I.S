'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search, MapPin, ExternalLink, CalendarDays } from 'lucide-react';
import type { StoreEventRow, StoreEventType } from '@/lib/types';
import {
  filterEvents,
  citiesOf,
  INITIAL_EVENT_FILTERS,
  type EventFilterState,
} from '@/lib/utils/filter-events';
import { EVENT_TYPE_COLOR, formatEventDate } from '@/lib/utils/format-event';

const TYPES: Array<StoreEventType | 'all'> = [
  'all', 'prerelease', 'tournament', 'league_cup', 'league_challenge', 'league',
];

export default function EventsList({ events }: { events: StoreEventRow[] }) {
  const t = useTranslations('events');
  const [filters, setFilters] = useState<EventFilterState>(INITIAL_EVENT_FILTERS);
  const cities = useMemo(() => citiesOf(events), [events]);
  const visible = useMemo(() => filterEvents(events, filters), [events, filters]);

  const typeLabel = (ty: StoreEventType | 'all') =>
    ty === 'all' ? t('filterAllTypes') : t(`type_${ty}`);

  if (events.length === 0) {
    return (
      <div className="bg-surface border-border rounded-lg border p-6">
        <p className="text-text-muted text-sm">{t('empty')}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-bg sticky top-0 z-10 -mx-4 mb-4 flex flex-col gap-3 px-4 py-3 md:mx-0 md:px-0">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
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

      {visible.length === 0 ? (
        <div className="bg-surface border-border rounded-lg border p-6">
          <p className="text-text-muted text-sm">{t('emptyFiltered')}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((e) => (
            <EventRow key={e.id} event={e} noTimeLabel={t('dateOnly')} typeLabel={typeLabel} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EventRow({
  event,
  noTimeLabel,
  typeLabel,
}: {
  event: StoreEventRow;
  noTimeLabel: string;
  typeLabel: (ty: StoreEventType | 'all') => string;
}) {
  const date = formatEventDate(event.starts_at);
  return (
    <li className="bg-surface border-border [content-visibility:auto] [contain-intrinsic-size:auto_84px] flex items-stretch gap-3 rounded-lg border p-2 text-sm sm:p-3">
      {/* Date block */}
      <div className="bg-surface-2 flex w-[84px] shrink-0 flex-col items-center justify-center rounded px-1 py-1.5 text-center">
        {date ? (
          <>
            <span className="text-text text-xs font-semibold leading-tight" suppressHydrationWarning>{date.day}</span>
            <span className="text-red mt-0.5 font-mono text-[11px]" suppressHydrationWarning>{date.time ?? noTimeLabel}</span>
          </>
        ) : (
          <CalendarDays className="text-text-faint h-5 w-5" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="text-text truncate text-xs font-medium sm:text-sm">{event.title}</p>
        <div className="text-text-muted mt-1 flex flex-wrap items-center gap-1.5 text-[10px] sm:text-xs">
          {event.event_type && (
            <span className={`rounded px-1.5 py-0.5 font-medium ${EVENT_TYPE_COLOR[event.event_type]}`}>
              {typeLabel(event.event_type)}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {event.shop_name} · {event.city}
          </span>
          {event.price != null && event.price > 0 && (
            <span className="font-mono">{event.price.toFixed(2)} €</span>
          )}
        </div>
      </div>

      {/* Link out */}
      <a
        href={event.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-text-muted hover:text-red inline-flex shrink-0 items-center self-center rounded p-1.5"
        aria-label={event.title}
      >
        <ExternalLink className="h-4 w-4" />
      </a>
    </li>
  );
}
