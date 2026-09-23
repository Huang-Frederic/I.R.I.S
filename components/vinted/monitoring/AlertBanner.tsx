'use client';

export interface SessionStatus {
  hasSession: boolean;
  expired: boolean;
  expiresWithin48h: boolean;
}

interface Props {
  sessionStatus: SessionStatus | null;
}

export default function AlertBanner({ sessionStatus }: Props) {
  const sessionWarning =
    sessionStatus && (sessionStatus.expired || sessionStatus.expiresWithin48h)
      ? sessionStatus.expired
        ? 'Session Vinted expirée — relance la capture des cookies et colle-les ci-dessous.'
        : 'Session Vinted expire dans moins de 48h — pense à la rafraîchir bientôt.'
      : null;

  if (!sessionWarning) return null;

  return (
    <div className="bg-red-bg border-red text-red flex flex-col gap-1 rounded-lg border px-3 py-2 text-sm">
      <span>⚠️ {sessionWarning}</span>
    </div>
  );
}
