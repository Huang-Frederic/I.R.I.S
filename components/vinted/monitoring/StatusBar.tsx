'use client';

import { useAgentStatus } from '@/lib/hooks/useAgentStatus';
import { chipClassesForColor, colorForUserName } from '@/lib/utils/user-colors';

/** "Aujourd'hui 11:00" when `date` falls on `now`'s calendar day, else the
 *  usual "mar. 11:00" weekday-abbreviated form. */
export function formatNextPost(date: Date, now: Date = new Date()): string {
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const isToday =
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  if (isToday) return `Aujourd'hui ${time}`;
  return `${date.toLocaleDateString('fr-FR', { weekday: 'short' })} ${time}`;
}

interface Props {
  myName: string;
  myUserId: string;
  partnerName: string | null;
  partnerUserId: string | null;
  viewedUserId: string;
  onSwitchUser: (userId: string) => void;
  todayJobCount: number;
  dailyQuota: number;
  nextPostAt: Date | null;
}

export default function StatusBar({
  myName,
  myUserId,
  partnerName,
  partnerUserId,
  viewedUserId,
  onSwitchUser,
  todayJobCount,
  dailyQuota,
  nextPostAt,
}: Props) {
  const agentStatus = useAgentStatus();
  const myColor = colorForUserName(myName);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="bg-surface-2 border-border flex items-center gap-2 rounded-lg border px-3 py-1.5">
        <span
          className={`h-2 w-2 rounded-full ${agentStatus === 'online' ? 'bg-green-500' : 'bg-red'}`}
          aria-hidden
        />
        {agentStatus === 'online' ? 'Bot en ligne' : 'Bot hors ligne'}
      </span>
      <span className="bg-surface-2 border-border rounded-lg border px-3 py-1.5">
        Quota du jour : <strong>{todayJobCount} / {dailyQuota}</strong>
      </span>
      <span className="bg-surface-2 border-border rounded-lg border px-3 py-1.5">
        Prochain post estimé :{' '}
        <strong>
          {nextPostAt ? formatNextPost(nextPostAt) : '—'}
        </strong>
      </span>
      {partnerUserId && partnerName && (
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            onClick={() => onSwitchUser(myUserId)}
            className={`rounded-lg border px-3 py-1.5 ${chipClassesForColor(myColor, viewedUserId === myUserId)}`}
          >
            {myName}
          </button>
          <button
            type="button"
            onClick={() => onSwitchUser(partnerUserId)}
            className={`rounded-lg border px-3 py-1.5 ${chipClassesForColor(colorForUserName(partnerName), viewedUserId === partnerUserId)}`}
          >
            {partnerName}
          </button>
        </div>
      )}
    </div>
  );
}
