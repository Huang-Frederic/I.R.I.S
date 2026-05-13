'use client';

import { useMemo } from 'react';
import { summarizePrices } from '@/lib/utils/price-trend';
import type { PriceHistoryPoint } from '@/lib/types/price-history';

export interface PriceStatsGridProps {
  points: PriceHistoryPoint[];
}

function formatEur(v: number | null): string {
  if (v == null) return '—';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);
}

export function PriceStatsGrid({ points }: PriceStatsGridProps) {
  const stats = useMemo(() => summarizePrices(points), [points]);
  if (stats.median == null) return null;

  return (
    <div className="border-border grid grid-cols-4 gap-2 rounded border p-3 text-center text-xs">
      <div>
        <p className="text-text-faint">Min</p>
        <p>{formatEur(stats.min)}</p>
      </div>
      <div>
        <p className="text-text-faint">Max</p>
        <p>{formatEur(stats.max)}</p>
      </div>
      <div>
        <p className="text-text-faint">Médiane</p>
        <p>{formatEur(stats.median)}</p>
      </div>
      <div>
        <p className="text-text-faint">Volatilité</p>
        <p>{stats.volatility == null ? '—' : `±${stats.volatility.toFixed(1)}%`}</p>
      </div>
    </div>
  );
}
