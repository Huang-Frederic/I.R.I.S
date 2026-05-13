'use client';

import { useEffect, useMemo } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { computeCascadeTrend } from '@/lib/utils/price-trend';
import { usePriceTrendsContext } from './PriceTrendsProvider';

export type PriceWithTrendProps = {
  cardId: string;
  cmPriceAvg: number | null;
  cardmarketUrl?: string | null;
  variant: 'chip' | 'inline' | 'compact';
  onPriceClick?: () => void;
};

const VARIANT_CLASSES: Record<PriceWithTrendProps['variant'], string> = {
  chip: 'inline-flex items-center gap-1.5 rounded border border-border bg-surface-2 px-2 py-1 text-sm',
  inline: 'inline-flex items-center gap-1 text-sm',
  compact: 'inline-flex items-center gap-0.5 text-xs',
};

function formatEur(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
}

export function PriceWithTrend({
  cardId,
  cmPriceAvg,
  variant,
  onPriceClick,
}: PriceWithTrendProps) {
  const ctx = usePriceTrendsContext();

  useEffect(() => {
    if (cmPriceAvg != null) ctx?.register(cardId);
  }, [ctx, cardId, cmPriceAvg]);

  const trend = useMemo(() => {
    if (cmPriceAvg == null || !ctx) return null;
    const points = ctx.getPoints(cardId);
    const todayIso = new Date().toISOString().slice(0, 10);
    return computeCascadeTrend(points, cmPriceAvg, todayIso);
  }, [ctx, cardId, cmPriceAvg]);

  if (cmPriceAvg == null) return null;

  const tooltip = trend
    ? `${trend.delta_pct >= 0 ? '+' : ''}${trend.delta_pct.toFixed(1)}% sur ${trend.period_days}j (${formatEur(trend.base_price)} → ${formatEur(trend.current_price)})`
    : undefined;

  const arrow = trend ? (
    trend.delta_pct > 0 ? (
      <ArrowUp
        className="h-3.5 w-3.5 text-green-600 dark:text-green-400"
        aria-label="hausse"
      />
    ) : (
      <ArrowDown
        className="h-3.5 w-3.5 text-red-600 dark:text-red-400"
        aria-label="baisse"
      />
    )
  ) : null;

  return (
    <span className={VARIANT_CLASSES[variant]} title={tooltip}>
      <button
        type="button"
        onClick={onPriceClick}
        className={onPriceClick ? 'cursor-pointer hover:underline' : 'cursor-default'}
        disabled={!onPriceClick}
      >
        {formatEur(cmPriceAvg)}
      </button>
      {arrow}
    </span>
  );
}
