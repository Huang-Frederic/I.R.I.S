'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { X, ExternalLink, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchHistoryForCard } from '@/lib/api/price-history';
import CardImagesPair from './CardImagesPair';
import { PriceTrioBlock } from './PriceTrioBlock';
import { PriceHistoryChart } from './PriceHistoryChart';
import { PriceStatsGrid } from './PriceStatsGrid';
import { DeltaMatrix } from './DeltaMatrix';
import type { Card } from '@/lib/types';
import type { PriceHistoryPoint } from '@/lib/types/price-history';

export interface PriceDetailModalProps {
  card: Card;
  open: boolean;
  onClose: () => void;
  /** Called after a successful refresh, with the updated card. */
  onCardUpdated?: (updated: Card) => void;
}

export function PriceDetailModal({ card, open, onClose, onCardUpdated }: PriceDetailModalProps) {
  const t = useTranslations('prices.modal');
  const router = useRouter();
  const [points, setPoints] = useState<PriceHistoryPoint[]>([]);
  const [todayPoint, setTodayPoint] = useState<PriceHistoryPoint | null>(null);
  const [currentCard, setCurrentCard] = useState<Card>(card);

  useEffect(() => {
    setCurrentCard(card);
  }, [card]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const all = await fetchHistoryForCard(supabase, card.id, null); // unlimited
      if (cancelled) return;
      setPoints(all);
      const todayIso = new Date().toISOString().slice(0, 10);
      setTodayPoint(all.find((p) => p.bucket_date === todayIso && p.granularity === 'daily') ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, card.id]);

  const handleRefresh = async () => {
    const res = await fetch(`/api/prices/update?card_id=${currentCard.id}`, { method: 'POST' });
    if (!res.ok) return;
    // Single-card endpoint wraps the row in `{ ok: true, card: ... }`.
    const json = (await res.json()) as { ok?: boolean; card?: Card } | Card;
    const updated = (json as { card?: Card }).card ?? (json as Card);
    setCurrentCard(updated);
    onCardUpdated?.(updated);
    // Re-fetch today's snapshot row (the cron will reconcile at 23:55 too).
    const supabase = createClient();
    const all = await fetchHistoryForCard(supabase, updated.id, null);
    setPoints(all);
    const todayIso = new Date().toISOString().slice(0, 10);
    setTodayPoint(all.find((p) => p.bucket_date === todayIso && p.granularity === 'daily') ?? null);
  };

  if (!open) return null;

  return (
    <div className="bg-black/60 fixed inset-0 z-50 flex items-start justify-center overflow-hidden p-4 sm:items-center">
      <div className="bg-bg flex max-h-[90dvh] w-full max-w-3xl flex-col rounded-lg shadow-xl">
        <div className="bg-bg border-border sticky top-0 z-10 flex items-center justify-between rounded-t-lg border-b p-3">
          <span className="text-text-muted text-xs">{currentCard.set_name ?? '—'}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="hover:bg-surface-2 rounded p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <CardImagesPair myPhoto={currentCard.image_url ?? ''} tcgPhoto={currentCard.tcg_image_url ?? null} />

          <PriceTrioBlock
            cardId={currentCard.id}
            cmPriceLow={currentCard.cm_price_low}
            cmPriceTrend={currentCard.cm_price_trend}
            cmPriceAvg={currentCard.cm_price_avg}
            cmUpdatedAt={currentCard.cm_updated_at}
            sourceFreshnessDays={todayPoint?.source_freshness_days ?? null}
            onRefresh={handleRefresh}
          />

          <PriceHistoryChart points={points} />

          {points.length >= 2 && currentCard.cm_price_avg != null && (
            <>
              <PriceStatsGrid points={points} />
              <DeltaMatrix points={points} currentPrice={currentCard.cm_price_avg} />
            </>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            {currentCard.cardmarket_url && (
              <a
                href={currentCard.cardmarket_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-muted hover:text-text inline-flex items-center gap-1 text-xs"
              >
                {t('cardmarketLink')} <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <button
              type="button"
              onClick={() => {
                onClose();
                router.push(`/prices?set=${encodeURIComponent(currentCard.set_code ?? '')}`);
              }}
              className="text-text-muted hover:text-text inline-flex items-center gap-1 text-xs"
            >
              {t('viewAllMovements')} <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
