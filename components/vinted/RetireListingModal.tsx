'use client';

import { useTranslations } from 'next-intl';
import { Archive, Trash2, X, AlertTriangle } from 'lucide-react';
import Modal from '@/components/ui/Modal';

interface Props {
  cardName?: string | null;
  /** Display name of the partner if they ALSO have an active listing on this
   *  card. Triggers an info banner so the user knows the partner will see a
   *  state change in their /vinted view. */
  partnerName: string | null;
  busy?: boolean;
  /** Move the card to status='collection' (Stock) + delete my listing. */
  onStock: () => void;
  /** Delete the card row entirely (cascade-deletes all listings). */
  onDelete: () => void;
  onCancel: () => void;
}

export default function RetireListingModal({
  cardName,
  partnerName,
  busy = false,
  onStock,
  onDelete,
  onCancel,
}: Props) {
  const t = useTranslations('retireListing');
  const tCommon = useTranslations('common');
  return (
    <Modal
      open={true}
      onClose={onCancel}
      ariaLabel={t('modalTitle')}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      className="bg-surface border-border w-full max-w-md rounded-lg border p-5 shadow-xl"
    >
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold">{t('title')}</h2>
          {cardName && <p className="text-text-muted mt-1 text-xs">{cardName}</p>}
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="text-text-muted hover:text-text disabled:opacity-50"
          aria-label={tCommon('close')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {partnerName && (
        <div className="border-rarity-ar/40 bg-rarity-ar/10 text-rarity-ar mb-4 flex items-start gap-2 rounded border px-3 py-2 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            {t.rich('partnerWarning', {
              name: partnerName,
              strong: (chunks) => <strong>{chunks}</strong>,
              em: (chunks) => <em>{chunks}</em>,
            })}
          </div>
        </div>
      )}

      <div className="mb-4 space-y-2">
        <button
          type="button"
          onClick={onStock}
          disabled={busy}
          className="border-rarity-r/50 bg-rarity-r/10 hover:bg-rarity-r/20 text-rarity-r flex w-full items-start gap-3 rounded border px-3 py-2.5 text-left transition-colors disabled:opacity-50"
        >
          <Archive className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="text-sm font-semibold">{t('stockTitle')}</div>
            <div className="text-text-muted text-xs">{t('stockBody')}</div>
          </div>
        </button>

        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="border-red/50 bg-red/10 hover:bg-red/20 text-red flex w-full items-start gap-3 rounded border px-3 py-2.5 text-left transition-colors disabled:opacity-50"
        >
          <Trash2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="text-sm font-semibold">{t('deleteTitle')}</div>
            <div className="text-text-muted text-xs">{t('deleteBody')}</div>
          </div>
        </button>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="bg-surface-2 hover:bg-surface-off border-border rounded border px-3 py-1.5 text-xs disabled:opacity-50"
        >
          {tCommon('cancel')}
        </button>
      </div>
    </Modal>
  );
}
