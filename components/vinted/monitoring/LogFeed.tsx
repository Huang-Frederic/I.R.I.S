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

export default function LogFeed({ logs }: Props) {
  if (logs.length === 0) {
    return <p className="text-text-muted text-xs">Aucun événement récent.</p>;
  }

  return (
    <ul className="flex flex-col gap-1 text-xs">
      {logs.map((log) => (
        <li key={log.id} className={LEVEL_COLOR[log.level]}>
          <span className="text-text-faint">
            {new Date(log.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </span>{' '}
          {log.message}
        </li>
      ))}
    </ul>
  );
}
