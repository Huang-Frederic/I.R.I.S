'use client';

import { useTranslations } from 'next-intl';
import { ShoppingCart, X } from 'lucide-react';

interface Props {
  cardCount: number;
  lotCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function BulkSelectionBottomBar({ cardCount, lotCount, onConfirm, onCancel }: Props) {
  const t = useTranslations('vintedSold');
  const tCommon = useTranslations('common');
  const total = cardCount + lotCount;
  if (total === 0) return null;

  let counterText: string;
  if (cardCount === 0 && lotCount === 0) {
    counterText = t('bottomBarCounterEmpty');
  } else if (cardCount > 0 && lotCount === 0) {
    counterText = t('bottomBarCounterCards', { count: cardCount });
  } else if (cardCount === 0 && lotCount > 0) {
    counterText = t('bottomBarCounterLots', { count: lotCount });
  } else {
    counterText = t('bottomBarCounterMixed', {
      cards: t('bottomBarCounterCards', { count: cardCount }),
      lots: t('bottomBarCounterLots', { count: lotCount }),
      total,
    });
  }

  return (
    <div className="bg-surface border-border fixed inset-x-0 bottom-0 z-40 border-t shadow-lg md:left-[220px]">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 p-3">
        <p className="text-text text-sm font-medium">{counterText}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-text-muted hover:text-text inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm"
          >
            <X className="h-4 w-4" />
            {tCommon('cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="bg-red text-bg inline-flex items-center gap-1.5 rounded px-4 py-1.5 text-sm font-medium hover:opacity-90"
          >
            <ShoppingCart className="h-4 w-4" />
            {t('bottomBarSell', { count: total })}
          </button>
        </div>
      </div>
    </div>
  );
}
