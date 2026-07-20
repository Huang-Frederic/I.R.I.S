'use client';

import { useTranslations } from 'next-intl';
import { MapPin, ExternalLink, CalendarDays } from 'lucide-react';
import type { StoreEventRow, StoreEventType } from '@/lib/types';
import { EVENT_TYPE_COLOR, formatEventDate } from '@/lib/utils/format-event';

interface Props {
  event: StoreEventRow;
  /** When true, hide the date block (the calendar day panel already shows the day). */
  hideDate?: boolean;
}

/** One event row — shared by the list view and the calendar's selected-day panel. */
export default function EventRow({ event, hideDate = false }: Props) {
  const t = useTranslations('events');
  const date = formatEventDate(event.starts_at);
  const typeLabel = (ty: StoreEventType) => t(`type_${ty}`);

  return (
    <li className="bg-surface border-border [content-visibility:auto] [contain-intrinsic-size:auto_84px] flex items-stretch gap-3 rounded-lg border p-2 text-sm sm:p-3">
      {!hideDate && (
        <div className="bg-surface-2 flex w-[84px] shrink-0 flex-col items-center justify-center rounded px-1 py-1.5 text-center">
          {date ? (
            <>
              <span className="text-text text-xs font-semibold leading-tight" suppressHydrationWarning>{date.day}</span>
              <span className="text-red mt-0.5 font-mono text-[11px]" suppressHydrationWarning>{date.time ?? t('dateOnly')}</span>
            </>
          ) : (
            <CalendarDays className="text-text-faint h-5 w-5" />
          )}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="text-text truncate text-xs font-medium sm:text-sm">{event.title}</p>
        <div className="text-text-muted mt-1 flex flex-wrap items-center gap-1.5 text-[10px] sm:text-xs">
          {hideDate && date?.time && <span className="text-red font-mono">{date.time}</span>}
          {event.event_type && (
            <span className={`rounded px-1.5 py-0.5 font-medium ${EVENT_TYPE_COLOR[event.event_type]}`}>
              {typeLabel(event.event_type)}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {event.shop_name}{event.city ? ` · ${event.city}` : ''}
          </span>
          {event.price != null && event.price > 0 && (
            <span className="font-mono">{event.price.toFixed(2)} €</span>
          )}
        </div>
      </div>

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
