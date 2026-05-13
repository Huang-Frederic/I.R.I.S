'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { PriceWithTrend } from '@/components/ui/PriceWithTrend';
import PriceFreshnessBadge from '@/components/ui/PriceFreshnessBadge';

export interface PriceTrioBlockProps {
  cardId: string;
  cmPriceLow: number | null;
  cmPriceTrend: number | null;
  cmPriceAvg: number | null;
  cmUpdatedAt: string | null;
  /** From today's price_history row, when available. */
  sourceFreshnessDays: number | null;
  onRefresh: () => Promise<void>;
}

function formatEur(value: number | null): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
}

export function PriceTrioBlock({
  cardId,
  cmPriceLow,
  cmPriceTrend,
  cmPriceAvg,
  cmUpdatedAt,
  sourceFreshnessDays,
  onRefresh,
}: PriceTrioBlockProps) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="border-border rounded border p-3">
      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        <div>
          <p className="text-text-faint">Low</p>
          <p>{formatEur(cmPriceLow)}</p>
        </div>
        <div>
          <p className="text-text-faint">Trend</p>
          <p>{formatEur(cmPriceTrend)}</p>
        </div>
        <div>
          <p className="text-text-faint">Avg</p>
          <PriceWithTrend cardId={cardId} cmPriceAvg={cmPriceAvg} variant="inline" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <PriceFreshnessBadge cm_updated_at={cmUpdatedAt} />
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="bg-surface-2 hover:bg-surface-off border-border inline-flex items-center gap-1 rounded border px-2 py-1 text-xs disabled:opacity-50"
            aria-label="Rafraîchir le prix"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Maj…' : 'Maj'}
          </button>
        </div>
      </div>
      {sourceFreshnessDays != null && sourceFreshnessDays >= 2 && (
        <p className="text-text-faint mt-2 text-center text-xs italic">
          Snapshot basé sur un prix vieux de {sourceFreshnessDays}j
        </p>
      )}
    </div>
  );
}
