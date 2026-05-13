'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCw } from 'lucide-react';
import { PriceWithTrend } from '@/components/ui/PriceWithTrend';
import PriceFreshnessBadge from '@/components/ui/PriceFreshnessBadge';
import { formatEur } from '@/lib/utils/format-currency';

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

export function PriceTrioBlock({
  cardId,
  cmPriceLow,
  cmPriceTrend,
  cmPriceAvg,
  cmUpdatedAt,
  sourceFreshnessDays,
  onRefresh,
}: PriceTrioBlockProps) {
  const t = useTranslations('prices.trio');
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
          <p className="text-text-faint">{t('low')}</p>
          <p>{formatEur(cmPriceLow)}</p>
        </div>
        <div>
          <p className="text-text-faint">{t('trend')}</p>
          <p>{formatEur(cmPriceTrend)}</p>
        </div>
        <div>
          <p className="text-text-faint">{t('avg')}</p>
          <PriceWithTrend cardId={cardId} cmPriceAvg={cmPriceAvg} variant="inline" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <PriceFreshnessBadge cm_updated_at={cmUpdatedAt} />
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="bg-surface-2 hover:bg-surface-off border-border inline-flex items-center gap-1 rounded border px-2 py-1 text-xs disabled:opacity-50"
            aria-label={t('refreshAria')}
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? t('refreshing') : t('refresh')}
          </button>
        </div>
      </div>
      {sourceFreshnessDays != null && sourceFreshnessDays >= 2 && (
        <p className="text-text-faint mt-2 text-center text-xs italic">
          {t('lagged', { days: sourceFreshnessDays })}
        </p>
      )}
    </div>
  );
}
