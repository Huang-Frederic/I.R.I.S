'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeftRight, Camera, X } from 'lucide-react';
import type { Card } from '@/lib/types';
import Modal from '@/components/ui/Modal';
import { resizeImage } from '@/lib/utils/resize-image';
import { displayCardName } from '@/lib/utils/format-name';

interface Props {
  cards: Card[];
  onClose: () => void;
  /** photo is already resized (1400px max edge) — null when the user skipped it. */
  onConfirm: (dateTradedIso: string, photo: Blob | null) => Promise<void>;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function thumbUrl(card: Card): string {
  if (card.image_url) return card.image_url;
  if (card.tcg_image_url) return card.tcg_image_url;
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${card.pokemon_number}.png`;
}

/**
 * Bulk trade — mirror of BulkSoldModal without the price: the selected cards
 * are marked 'traded' with an optional photo of the whole exchange.
 */
export default function BulkTradeModal({ cards, onClose, onConfirm }: Props) {
  const t = useTranslations('vintedTrade');
  const tCommon = useTranslations('common');
  const [date, setDate] = useState(todayIso());
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const photoPreview = useMemo(
    () => (photoFile ? URL.createObjectURL(photoFile) : null),
    [photoFile],
  );
  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const valid = cards.length > 0 && date !== '';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    try {
      const blob = photoFile ? await resizeImage(photoFile, { maxDim: 1400 }) : null;
      await onConfirm(new Date(`${date}T12:00:00Z`).toISOString(), blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={submitting ? () => {} : onClose}
      ariaLabel={t('bulkTitle')}
      closeOnBackdrop={!submitting}
      closeOnEscape={!submitting}
      className="bg-surface border-border w-full max-w-lg rounded-lg border p-6 shadow-xl"
    >
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
            <ArrowLeftRight className="text-red h-5 w-5" />
            {t('bulkTitle')}
          </h2>
          <p className="text-text-muted mt-1 text-sm">{t('bulkSubtitle', { count: cards.length })}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="text-text-muted hover:text-text"
          aria-label={tCommon('close')}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <ul className="mb-4 max-h-60 space-y-1.5 overflow-y-auto pr-1">
        {cards.map((card) => (
          <li key={card.id} className="bg-surface-2 flex items-center gap-2 rounded p-2 text-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbUrl(card)} alt="" className="bg-surface-off h-10 w-7 shrink-0 rounded object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{displayCardName(card)}</p>
              <p className="text-text-muted text-xs">{card.language} · {card.condition}</p>
            </div>
          </li>
        ))}
      </ul>

      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="text-text-muted text-xs">{t('dateLabel')}</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
          />
        </label>

        <div>
          <span className="text-text-muted text-xs">{t('photoLabel')}</span>
          {photoPreview ? (
            <div className="mt-1 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoPreview} alt={t('photoPreviewAlt')} className="bg-surface-off h-20 w-20 rounded object-cover" />
              <button
                type="button"
                onClick={() => setPhotoFile(null)}
                className="text-text-muted hover:text-red inline-flex items-center gap-1 text-xs"
              >
                <X className="h-3.5 w-3.5" />
                {t('photoRemove')}
              </button>
            </div>
          ) : (
            <label className="bg-surface-2 border-border hover:border-red mt-1 flex cursor-pointer items-center justify-center gap-2 rounded border border-dashed px-3 py-4 text-sm">
              <Camera className="text-text-muted h-4 w-4" />
              <span className="text-text-muted">{t('photoPick')}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
        </div>

        {error && <p className="text-red text-xs">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="bg-surface-2 hover:bg-surface-off border-border rounded border px-4 py-1.5 text-sm"
          >
            {tCommon('cancel')}
          </button>
          <button
            type="submit"
            disabled={!valid || submitting}
            className="bg-red text-bg rounded px-4 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? t('submitting') : t('submit')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
