'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { X, Trash2, Tag, Package } from 'lucide-react';
import type { Card } from '@/lib/types';
import { displayCardName } from '@/lib/utils/format-name';
import { translateErrorCode } from '@/lib/utils/translate-error';

interface Props {
  card: Card;
  /** True if a for_sale card of the same group already exists. Disables "Vers Vinted". */
  hasForSaleConflict: boolean;
  onClose: () => void;
  onDone: () => void;
}

export default function PokedexCardActionsModal({ card, hasForSaleConflict, onClose, onDone }: Props) {
  const t = useTranslations('pokedex');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Escape closes the modal unless a network call is in flight.
  useEffect(() => {
    if (submitting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [submitting, onClose]);

  const moveTo = async (status: 'for_sale' | 'collection') => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        const localized = translateErrorCode(tErrors, body.error);
        throw new Error(localized ?? body.message ?? t('actionFailed', { status: res.status }));
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : tCommon('errorUnknown'));
      setSubmitting(false);
    }
  };

  const remove = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/cards/${card.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        const localized = translateErrorCode(tErrors, body.error);
        throw new Error(localized ?? body.message ?? t('deleteFailed', { status: res.status }));
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : tCommon('errorUnknown'));
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={submitting ? undefined : onClose}
    >
      <div
        className="bg-surface border-border w-full max-w-md rounded-lg border p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t('actionsTitle')}</h2>
            <p className="text-text-muted mt-1 text-sm">{displayCardName(card)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-text-muted hover:text-text disabled:opacity-50"
            aria-label={t('drawerCloseInnerAria')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && <p className="text-red mb-3 text-xs">{error}</p>}

        {hasForSaleConflict && (
          <p className="text-text-muted mb-3 text-xs">
            {t('actionsConflict')}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => moveTo('collection')}
            disabled={submitting}
            className="bg-surface-2 hover:bg-surface-off border-border inline-flex items-center justify-center gap-2 rounded border px-4 py-2 text-sm disabled:opacity-50"
          >
            <Package className="h-4 w-4" />
            {t('actionsMoveToStock')}
          </button>

          <button
            type="button"
            onClick={() => moveTo('for_sale')}
            disabled={submitting || hasForSaleConflict}
            title={hasForSaleConflict ? t('actionsConflictTitle') : undefined}
            className="bg-surface-2 hover:bg-surface-off border-border inline-flex items-center justify-center gap-2 rounded border px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Tag className="h-4 w-4" />
            {t('actionsMoveToVinted')}
          </button>

          <button
            type="button"
            onClick={remove}
            disabled={submitting}
            className="bg-red text-bg inline-flex items-center justify-center gap-2 rounded px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            {t('actionsDeleteForever')}
          </button>
        </div>

        <p className="text-text-faint mt-3 text-xs">
          {t('actionsFooter')}
        </p>
      </div>
    </div>
  );
}
