'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { X, Package, Tag } from 'lucide-react';
import { VARIANT_LABEL } from '@/lib/utils/labels';
import { displayCardName } from '@/lib/utils/format-name';
import { translateErrorCode } from '@/lib/utils/translate-error';

export interface ExchangeConflictCard {
  id: string;
  card_name: string;
  image_url: string | null;
  tcg_image_url: string | null;
  set_name: string | null;
  set_code: string | null;
  language: string;
  condition: string;
  rarity: string;
  variant: string | null;
}

interface Props {
  /** The card the user wants to put on Vinted (the new one). */
  newCard: { id: string; cardName: string };
  /** The existing for_sale card that blocks the promotion. */
  conflictCard: ExchangeConflictCard;
  onClose: () => void;
  /** Called after the swap succeeds. The parent should refresh. */
  onExchanged: () => void;
}

export default function ExchangeOnConflictModal({ newCard, conflictCard, onClose, onExchanged }: Props) {
  const t = useTranslations('exchangeOnConflict');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const variantLabel = conflictCard.variant ? (VARIANT_LABEL[conflictCard.variant] ?? conflictCard.variant) : null;
  const conflictThumb = conflictCard.image_url ?? conflictCard.tcg_image_url;

  const exchange = async (sendTo: 'collection' | 'sold') => {
    setSubmitting(true);
    setError(null);
    try {
      // Step 1: demote the existing for_sale card
      const res1 = await fetch(`/api/cards/${conflictCard.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: sendTo }),
      });
      if (!res1.ok) {
        const body = (await res1.json().catch(() => ({}))) as { message?: string; error?: string };
        const localized = translateErrorCode(tErrors, body.error);
        throw new Error(localized ?? body.message ?? t('demotionFailed'));
      }

      // Step 2: promote the new card
      const res2 = await fetch(`/api/cards/${newCard.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'for_sale' }),
      });
      if (!res2.ok) {
        const body = (await res2.json().catch(() => ({}))) as { message?: string; error?: string };
        const localized = translateErrorCode(tErrors, body.error);
        throw new Error(localized ?? body.message ?? t('promotionFailed'));
      }

      onExchanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : tCommon('errorUnknown'));
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-surface border-border w-full max-w-md rounded-lg border p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t('title')}</h2>
            <p className="text-text-muted mt-1 text-sm">
              {t.rich('subtitle', {
                name: displayCardName(conflictCard),
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-text-muted hover:text-text disabled:opacity-50"
            aria-label={tCommon('close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="my-4 flex items-center gap-3">
          {conflictThumb ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={conflictThumb}
              alt={conflictCard.card_name}
              className="bg-surface-off h-[140px] w-[100px] shrink-0 rounded object-cover"
            />
          ) : (
            <div className="bg-surface-off flex h-[140px] w-[100px] shrink-0 items-center justify-center rounded text-xs text-text-faint">
              {tCommon('noImage')}
            </div>
          )}
          <div className="flex flex-col gap-1 text-sm">
            <p className="font-medium">{conflictCard.card_name}</p>
            {conflictCard.set_name && (
              <p className="text-text-muted text-xs">
                {conflictCard.set_name}{conflictCard.set_code ? ` (${conflictCard.set_code})` : ''}
              </p>
            )}
            <p className="text-text-muted text-xs">
              {conflictCard.language} · {conflictCard.rarity} · {conflictCard.condition}
              {variantLabel ? ` · ${variantLabel}` : ''}
            </p>
            <p className="text-rarity-r mt-1 text-xs">{t('currentlyForSale')}</p>
          </div>
        </div>

        <p className="text-text-muted mb-3 text-xs">
          {t.rich('destinationPrompt', {
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>

        {error && <p className="text-red mb-2 text-xs">{error}</p>}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="bg-surface-2 hover:bg-surface-off border-border rounded border px-4 py-2 text-sm disabled:opacity-50"
          >
            {tCommon('cancel')}
          </button>
          <button
            type="button"
            onClick={() => exchange('collection')}
            disabled={submitting}
            className="bg-surface-2 hover:bg-surface-off border-border inline-flex items-center justify-center gap-1.5 rounded border px-4 py-2 text-sm disabled:opacity-50"
          >
            <Package className="h-3.5 w-3.5" />
            {t('toStock')}
          </button>
          <button
            type="button"
            onClick={() => exchange('sold')}
            disabled={submitting}
            className="bg-red text-bg inline-flex items-center justify-center gap-1.5 rounded px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <Tag className="h-3.5 w-3.5" />
            {t('markSold')}
          </button>
        </div>
      </div>
    </div>
  );
}
