'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import type { Card, Lot } from '@/lib/types';
import type { RestockAlert } from '@/lib/utils/restock-detection';
import type { PromoteCandidate } from '@/lib/utils/promote-detection';
import { displayCardName } from '@/lib/utils/format-name';
import { translateErrorCode } from '@/lib/utils/translate-error';

export type SoldEntity =
  | { kind: 'card'; card: Card }
  | { kind: 'lot'; lot: Lot };

interface Props {
  entity: SoldEntity;
  onClose: () => void;
  onSold: (info: {
    soldId: string;
    kind: 'card' | 'lot';
    restock: RestockAlert | null;
    promote: PromoteCandidate | null;
  }) => void;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function SoldModal({ entity, onClose, onSold }: Props) {
  const t = useTranslations('vintedSold');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const [price, setPrice] = useState<string>('');
  const [date, setDate] = useState<string>(todayIso());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Escape closes the modal except while a sold-mark is in flight.
  useEffect(() => {
    if (submitting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [submitting, onClose]);

  const displayName = entity.kind === 'card' ? displayCardName(entity.card) : entity.lot.name;
  const targetId = entity.kind === 'card' ? entity.card.id : entity.lot.id;
  const endpoint = entity.kind === 'card' ? `/api/cards/${targetId}` : `/api/lots/${targetId}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const parsedPrice = price.trim() === '' ? null : Number(price.replace(',', '.'));
      if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
        throw new Error(t('errorInvalidPrice'));
      }
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'sold',
          sold_price: parsedPrice,
          date_sold: new Date(`${date}T12:00:00Z`).toISOString(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const localized = translateErrorCode(tErrors, json.error);
        throw new Error(localized ?? json.message ?? t('errorServer'));
      }
      onSold({
        soldId: targetId,
        kind: entity.kind,
        restock: json.restock ?? null,
        promote: json.promote ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={submitting ? undefined : onClose}
    >
      <div
        className="bg-surface border-border w-full max-w-md rounded-lg border p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t('modalTitle')}</h2>
            <p className="text-text-muted mt-1 text-sm">{displayName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text"
            aria-label={tCommon('close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="text-text-muted text-xs">{t('salePriceLabel')}</span>
            <input
              type="text"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="—"
              className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
            />
          </label>

          <label className="block">
            <span className="text-text-muted text-xs">{t('saleDateLabel')}</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
            />
          </label>

          {error && <p className="text-red text-xs">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="bg-surface-2 hover:bg-surface-off border-border rounded border px-4 py-1.5 text-sm"
            >
              {tCommon('cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bg-red text-bg rounded px-4 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? t('submitting') : t('submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
