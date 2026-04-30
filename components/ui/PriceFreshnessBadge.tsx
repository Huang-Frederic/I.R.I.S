'use client';

import { useEffect, useState } from 'react';
import { formatStaleness, type StalenessTone } from '@/lib/utils/format-staleness';

interface Props {
  cm_updated_at: string | null;
}

const TONE_CLASS: Record<StalenessTone, string> = {
  fresh: 'text-staleness-fresh',
  stale: 'text-staleness-stale',
  old:   'text-staleness-old',
  never: 'text-staleness-never',
};

/**
 * Small inline badge that maps cm_updated_at to a 4-tone freshness label.
 * Renders nothing on the server (cm_updated_at is per-card data; the label
 * depends on Date.now() which differs per render, so we keep it client-only
 * to avoid hydration noise).
 */
export default function PriceFreshnessBadge({ cm_updated_at }: Props) {
  const [now, setNow] = useState<Date | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setNow(new Date()); }, []);
  if (now === null) return null;

  const { tone, label } = formatStaleness(cm_updated_at, now);
  return (
    <span
      className={`text-xs ${TONE_CLASS[tone]}`}
      title="Date du dernier rafraîchissement Cardmarket via TCGdex"
    >
      {label}
    </span>
  );
}
