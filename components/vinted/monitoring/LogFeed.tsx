'use client';

import type { VintedAgentLogRow } from '@/lib/types';

const LEVEL_COLOR: Record<VintedAgentLogRow['level'], string> = {
  info: 'text-text-muted',
  warn: 'text-rarity-ar',
  error: 'text-red',
};

interface Props {
  logs: VintedAgentLogRow[];
}

/** "Aujourd'hui" / "Hier" for the two most recent days, else a plain
 *  "28 septembre" — logs are shown newest-first, so those are the only two
 *  relative labels a user would actually reach for while scanning down. */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return 'Hier';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

export default function LogFeed({ logs }: Props) {
  if (logs.length === 0) {
    return <p className="text-text-muted text-xs">Aucun événement récent.</p>;
  }

  return (
    <ul className="flex flex-col gap-1 text-xs">
      {logs.map((log, i) => {
        const day = dayLabel(log.created_at);
        const isNewDay = i === 0 || day !== dayLabel(logs[i - 1].created_at);
        return (
          <li key={log.id}>
            {isNewDay && (
              <div className="text-text-faint border-border my-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide first:mt-0">
                <span className="border-border h-px flex-1 border-t" />
                {day}
                <span className="border-border h-px flex-1 border-t" />
              </div>
            )}
            <div className={LEVEL_COLOR[log.level]}>
              <span className="text-text-faint">
                {new Date(log.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </span>{' '}
              {log.message}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
