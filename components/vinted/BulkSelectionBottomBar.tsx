'use client';

import { useTranslations } from 'next-intl';
import { ArrowLeftRight, Rocket, ShoppingCart, X } from 'lucide-react';

interface Props {
  cardCount: number;
  lotCount: number;
  /** Opens the bulk-sold modal. Omitted on views where selling doesn't apply
   *  (e.g. /stock, where the bar is trade-only). */
  onConfirm?: () => void;
  onCancel: () => void;
  /** Opens the bulk-trade modal. Shows whenever at least one card is selected
   *  (the trade flow only ever acts on the selected cards; any selected lots
   *  are left untouched — lots stay sell-only). */
  onTrade?: () => void;
  /** Push (publish offline items) / Bump (repost online items) the whole
   *  selection in one go. Acts on both cards and lots. */
  onPushBump?: () => void;
}

export default function BulkSelectionBottomBar({ cardCount, lotCount, onConfirm, onCancel, onTrade, onPushBump }: Props) {
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
      {/* flex-wrap: with three buttons (Annuler / Échanger / Vendre) the row
          overflows a phone viewport — let the actions drop below the counter
          instead of clipping off-screen. */}
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 p-2.5 sm:gap-3 sm:p-3">
        <p className="text-text text-xs font-medium sm:text-sm">{counterText}</p>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-text-muted hover:text-text inline-flex items-center gap-1 rounded px-2 py-1.5 text-xs sm:gap-1.5 sm:px-3 sm:text-sm"
          >
            <X className="h-4 w-4" />
            {tCommon('cancel')}
          </button>
          {onPushBump && (
            <button
              type="button"
              onClick={onPushBump}
              className="bg-surface-2 border-border text-text hover:border-red inline-flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs font-medium sm:gap-1.5 sm:px-4 sm:text-sm"
            >
              <Rocket className="h-4 w-4" />
              {t('bottomBarPushBump', { count: total })}
            </button>
          )}
          {onTrade && cardCount > 0 && (
            <button
              type="button"
              onClick={onTrade}
              className={
                onConfirm
                  ? 'bg-surface-2 border-border text-text hover:border-red inline-flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs font-medium sm:gap-1.5 sm:px-4 sm:text-sm'
                  : 'bg-red text-bg inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-medium hover:opacity-90 sm:gap-1.5 sm:px-4 sm:text-sm'
              }
            >
              <ArrowLeftRight className="h-4 w-4" />
              {t('bottomBarTrade', { count: cardCount })}
            </button>
          )}
          {onConfirm && (
            <button
              type="button"
              onClick={onConfirm}
              className="bg-red text-bg inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-medium hover:opacity-90 sm:gap-1.5 sm:px-4 sm:text-sm"
            >
              <ShoppingCart className="h-4 w-4" />
              {t('bottomBarSell', { count: total })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
