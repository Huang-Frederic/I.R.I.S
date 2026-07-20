'use client';

import { useTranslations } from 'next-intl';
import { Store, ExternalLink } from 'lucide-react';
import { EVENT_SOURCES } from '@/lib/data/event-sources';
import type { StoreEventRow } from '@/lib/types';

/**
 * The "Boutiques suivies" panel — lists every shop in the directory with a link
 * to its events page and a live count. Shops without a live extractor yet show
 * a "à venir" badge so the list stays honest.
 */
export default function ShopLegend({ events }: { events: StoreEventRow[] }) {
  const t = useTranslations('events');

  const countBySource = new Map<string, number>();
  for (const e of events) countBySource.set(e.source, (countBySource.get(e.source) ?? 0) + 1);

  return (
    <div className="bg-surface border-border mt-6 rounded-lg border p-4">
      <h2 className="text-text-muted mb-3 inline-flex items-center gap-1.5 text-xs font-medium uppercase">
        <Store className="h-3.5 w-3.5" />
        {t('legendTitle')}
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {EVENT_SOURCES.map((s) => {
          const count = countBySource.get(s.id) ?? 0;
          return (
            <li key={s.id}>
              <a
                href={s.eventsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-surface-2 hover:border-red border-border group flex items-center gap-2 rounded border px-3 py-2 text-sm transition-colors"
              >
                <span className="min-w-0 flex-1">
                  <span className="text-text block truncate font-medium">{s.name}</span>
                  {s.city && <span className="text-text-muted text-xs">{s.city}</span>}
                </span>
                {s.scraped ? (
                  <span className="text-text-muted shrink-0 font-mono text-xs">{t('legendCount', { count })}</span>
                ) : (
                  <span className="bg-surface-off text-text-faint shrink-0 rounded px-1.5 py-0.5 text-[10px]">
                    {t('legendSoon')}
                  </span>
                )}
                <ExternalLink className="text-text-faint group-hover:text-red h-3.5 w-3.5 shrink-0" />
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
