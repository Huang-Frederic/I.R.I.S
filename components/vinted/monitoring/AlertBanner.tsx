'use client';

import type { VintedAgentLogRow } from '@/lib/types';

export interface SessionStatus {
  hasSession: boolean;
  expired: boolean;
  expiresWithin48h: boolean;
}

interface Props {
  sessionStatus: SessionStatus | null;
  logs: VintedAgentLogRow[];
}

export default function AlertBanner({ sessionStatus, logs }: Props) {
  const lastError = logs.find((l) => l.level === 'error') ?? null;
  const sessionWarning =
    sessionStatus && (sessionStatus.expired || sessionStatus.expiresWithin48h)
      ? sessionStatus.expired
        ? 'Session Vinted expirée — relance la capture des cookies et colle-les ci-dessous.'
        : 'Session Vinted expire dans moins de 48h — pense à la rafraîchir bientôt.'
      : null;

  if (!sessionWarning && !lastError) return null;

  return (
    <div className="bg-red-bg border-red text-red flex flex-col gap-1 rounded-lg border px-3 py-2 text-sm">
      {sessionWarning && <span>⚠️ {sessionWarning}</span>}
      {lastError && <span>⚠️ Dernière erreur : {lastError.message}</span>}
    </div>
  );
}
