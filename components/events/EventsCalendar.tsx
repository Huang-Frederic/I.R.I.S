'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { StoreEventRow, StoreEventType } from '@/lib/types';
import { buildMonthGrid, monthsWithEvents, initialMonth } from '@/lib/utils/event-calendar';
import { EVENT_TYPE_DOT } from '@/lib/utils/format-event';
import EventRow from './EventRow';

const WEEKDAYS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'] as const;

export default function EventsCalendar({ events }: { events: StoreEventRow[] }) {
  const t = useTranslations('events');

  const months = useMemo(() => monthsWithEvents(events), [events]);
  const [current, setCurrent] = useState(() => initialMonth(events));
  const [selected, setSelected] = useState<string | null>(null);

  const [year, month] = current.split('-').map(Number);
  const weeks = useMemo(() => buildMonthGrid(events, year, month - 1), [events, year, month]);

  const idx = months.indexOf(current);
  const prev = idx > 0 ? months[idx - 1] : null;
  const next = idx >= 0 && idx < months.length - 1 ? months[idx + 1] : null;

  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const selectedEvents = selected
    ? weeks.flat().find((d) => d.date === selected)?.events ?? []
    : [];

  return (
    <div>
      {/* Month navigation */}
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => prev && (setCurrent(prev), setSelected(null))}
          disabled={!prev}
          aria-label={t('calendarPrevMonth')}
          className="text-text-muted hover:text-text rounded p-1.5 disabled:opacity-30"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="text-sm font-semibold capitalize" suppressHydrationWarning>{monthLabel}</h2>
        <button
          type="button"
          onClick={() => next && (setCurrent(next), setSelected(null))}
          disabled={!next}
          aria-label={t('calendarNextMonth')}
          className="text-text-muted hover:text-text rounded p-1.5 disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Weekday header */}
      <div className="text-text-faint mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase sm:text-xs">
        {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1">
        {weeks.flat().map((day) => {
          const dayNum = Number(day.date.slice(8, 10));
          const hasEvents = day.events.length > 0;
          const isSelected = selected === day.date;
          return (
            <button
              key={day.date}
              type="button"
              disabled={!hasEvents}
              onClick={() => setSelected(isSelected ? null : day.date)}
              className={`flex min-h-[44px] flex-col items-center gap-1 rounded border p-1 text-xs transition-colors sm:min-h-[64px] ${
                isSelected
                  ? 'border-red bg-red-bg'
                  : hasEvents
                    ? 'border-border bg-surface hover:border-red cursor-pointer'
                    : 'border-transparent'
              } ${day.inMonth ? '' : 'opacity-30'}`}
            >
              <span className={day.inMonth ? 'text-text' : 'text-text-faint'}>{dayNum}</span>
              {hasEvents && (
                <span className="flex flex-wrap justify-center gap-0.5">
                  {day.events.slice(0, 4).map((e) => (
                    <span
                      key={e.id}
                      className={`h-1.5 w-1.5 rounded-full ${e.event_type ? EVENT_TYPE_DOT[e.event_type] : 'bg-text-faint'}`}
                    />
                  ))}
                  {day.events.length > 4 && <span className="text-text-faint text-[9px] leading-none">+</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Type legend for the dots */}
      <div className="text-text-muted mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] sm:text-xs">
        {(['prerelease', 'tournament', 'league_cup', 'league_challenge', 'league'] as StoreEventType[]).map((ty) => (
          <span key={ty} className="inline-flex items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${EVENT_TYPE_DOT[ty]}`} />
            {t(`type_${ty}`)}
          </span>
        ))}
      </div>

      {/* Selected day panel */}
      {selected && (
        <div className="mt-4">
          <p className="text-text-muted mb-2 text-xs font-medium capitalize" suppressHydrationWarning>
            {new Date(`${selected}T00:00:00Z`).toLocaleDateString('fr-FR', {
              weekday: 'long', day: '2-digit', month: 'long', timeZone: 'UTC',
            })}
          </p>
          <ul className="space-y-2">
            {selectedEvents.map((e) => <EventRow key={e.id} event={e} hideDate />)}
          </ul>
        </div>
      )}
    </div>
  );
}
