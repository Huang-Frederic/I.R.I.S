'use client';

import { useEffect, useState } from 'react';
import type { ActiveJob } from './hooks/useActiveJob';

const JOB_TYPE_LABEL: Record<ActiveJob['jobType'], string> = {
  post: 'Publication en cours',
  repost: 'Republication en cours',
  delete: 'Suppression en cours',
};

function elapsedLabel(startedAt: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - new Date(startedAt).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}min`;
}

interface Props {
  activeJob: ActiveJob | null;
  pendingCount: number;
}

export default function ActiveJobBanner({ activeJob, pendingCount }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!activeJob) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeJob]);

  if (!activeJob && pendingCount === 0) return null;

  if (activeJob) {
    return (
      <div className="bg-surface-2 border-border flex items-center gap-3 rounded-lg border p-2.5 text-sm">
        {activeJob.itemImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={activeJob.itemImage} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
        )}
        <span className="flex-1 truncate">
          <strong>{JOB_TYPE_LABEL[activeJob.jobType]}</strong> — {activeJob.itemName}
        </span>
        <span className="text-text-muted shrink-0 text-xs">depuis {elapsedLabel(activeJob.startedAt, now)}</span>
      </div>
    );
  }

  return (
    <div className="bg-surface-2 border-border rounded-lg border p-2.5 text-sm">
      {pendingCount} job{pendingCount > 1 ? 's' : ''} en attente
    </div>
  );
}
