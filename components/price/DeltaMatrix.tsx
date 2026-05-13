'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { computeMultiPeriodDeltas } from '@/lib/utils/price-trend';
import type { PriceHistoryPoint, PriceTrend } from '@/lib/types/price-history';

export interface DeltaMatrixProps {
  points: PriceHistoryPoint[];
  currentPrice: number;
}

function DeltaCell({ label, trend }: { label: string; trend: PriceTrend | null }) {
  if (trend == null) {
    return (
      <div className="border-border rounded border p-2 text-center text-xs">
        <p className="text-text-faint">{label}</p>
        <p>—</p>
      </div>
    );
  }
  const up = trend.delta_pct >= 0;
  const Arrow = up ? ArrowUp : ArrowDown;
  const colorClass = up ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
  return (
    <div className="border-border rounded border p-2 text-center text-xs">
      <p className="text-text-faint">{label}</p>
      <p className={`inline-flex items-center gap-1 ${colorClass}`}>
        <Arrow className="h-3 w-3" />
        {up ? '+' : ''}{trend.delta_pct.toFixed(1)}%
      </p>
    </div>
  );
}

export function DeltaMatrix({ points, currentPrice }: DeltaMatrixProps) {
  const t = useTranslations('prices.delta');
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const deltas = useMemo(
    () => computeMultiPeriodDeltas(points, currentPrice, todayIso),
    [points, currentPrice, todayIso],
  );

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <DeltaCell label={t('d7')} trend={deltas.d7} />
      <DeltaCell label={t('d30')} trend={deltas.d30} />
      <DeltaCell label={t('d90')} trend={deltas.d90} />
      <DeltaCell label={t('d365')} trend={deltas.d365} />
    </div>
  );
}
