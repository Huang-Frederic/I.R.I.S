'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { StoreEventRow } from '@/lib/types';
import { buildMonthGrid, localDayKey } from '@/lib/utils/event-calendar';
import { SHOP_COLORS } from '@/lib/data/event-sources';
import EventRow from './EventRow';

const WEEKDAYS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'] as const;

/**
 * Calendar view. Desktop/landscape: selected day's events on the LEFT, the
 * month grid on the RIGHT. Mobile: grid on top, selected day below. Each day
 * shows one pin per distinct shop that has an event (colored by shop — the
 * ShopLegend below is the color key). Today is circled; past days are dimmed.
 */
export default function EventsCalendar({ events }: { events: StoreEventRow[] }) {
  const t = useTranslations('events');
  // Snapshot "today" once at mount (React-purity: no clock read during render).
  const [today] = useState(() => localDayKey(new Date()));
  const [ym, setYm] = useState(() => {
    const [y, m] = today.split('-').map(Number);
    return { y, m: m - 1 };
  });
  const [selected, setSelected] = useState<string>(today);

  const weeks = useMemo(() => buildMonthGrid(events, ym.y, ym.m), [events, ym]);
  const monthLabel = new Date(Date.UTC(ym.y, ym.m, 1)).toLocaleDateString('fr-FR', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  });

  const step = (delta: number) => {
    const d = new Date(Date.UTC(ym.y, ym.m + delta, 1));
    setYm({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
  };

  const selectedEvents = useMemo(
    () =>
      events
        .filter((e) => e.starts_at?.slice(0, 10) === selected)
        .sort((a, b) => (a.starts_at ?? '').localeCompare(b.starts_at ?? '')),
    [events, selected],
  );
  const selectedLabel = new Date(`${selected}T00:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long', timeZone: 'UTC',
  });

  return (
    <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
      {/* Selected day's events — left on desktop, below on mobile */}
      <div className="order-2 mt-4 lg:order-1 lg:mt-0">
        <p className="text-text-muted mb-2 text-xs font-medium capitalize" suppressHydrationWarning>
          {selectedLabel}
        </p>
        {selectedEvents.length === 0 ? (
          <div className="bg-surface border-border rounded-lg border p-4">
            <p className="text-text-muted text-sm">{t('noEventsThatDay')}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {selectedEvents.map((e) => <EventRow key={e.id} event={e} hideDate />)}
          </ul>
        )}
      </div>

      {/* Month grid — right on desktop, top on mobile */}
      <div className="order-1 lg:order-2">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label={t('calendarPrevMonth')}
            className="text-text-muted hover:text-text rounded p-1.5"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-sm font-semibold capitalize" suppressHydrationWarning>{monthLabel}</h2>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label={t('calendarNextMonth')}
            className="text-text-muted hover:text-text rounded p-1.5"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="text-text-faint mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase sm:text-xs">
          {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {weeks.flat().map((day) => {
            const dayNum = Number(day.date.slice(8, 10));
            const hasEvents = day.events.length > 0;
            const isSelected = selected === day.date;
            const isToday = day.date === today;
            const isPast = day.date < today;
            const shops = [...new Set(day.events.map((e) => e.source))];
            return (
              <button
                key={day.date}
                type="button"
                disabled={!hasEvents}
                onClick={() => setSelected(day.date)}
                className={`flex min-h-[44px] flex-col items-center gap-1 rounded border p-1 text-xs transition-colors sm:min-h-[60px] ${
                  isSelected
                    ? 'border-red bg-red-bg'
                    : hasEvents
                      ? 'border-border bg-surface hover:border-red cursor-pointer'
                      : 'border-transparent'
                } ${!day.inMonth ? 'opacity-30' : isPast && !isSelected ? 'opacity-45' : ''}`}
              >
                <span
                  className={
                    isToday
                      ? 'bg-red text-bg flex h-5 w-5 items-center justify-center rounded-full font-semibold'
                      : day.inMonth
                        ? 'text-text'
                        : 'text-text-faint'
                  }
                >
                  {dayNum}
                </span>
                {hasEvents && (
                  <span className="flex flex-wrap justify-center gap-0.5">
                    {shops.slice(0, 4).map((src) => (
                      <span
                        key={src}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: SHOP_COLORS[src] ?? '#888' }}
                      />
                    ))}
                    {shops.length > 4 && <span className="text-text-faint text-[9px] leading-none">+</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
