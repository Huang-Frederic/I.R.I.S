'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';

interface Props {
  partnerName: string;
  items: Array<{ displayName: string; kind: 'card' | 'lot' }>;
  onClose: () => void;
}

/**
 * Final modal in the sold flow when there's no restock candidate AND the
 * partner has an active listing on the same card/lot. Tells the user that
 * the partner needs to manually pull their Vinted listing — IRIS can't
 * delete a listing on the partner's account.
 *
 * Triggered by VintedList AFTER the user has confirmed the sale and
 * dismissed any restock proposal. Not shown when restock is available
 * (the new for-sale row covers the partner's listing).
 */
export default function PartnerCleanupModal({ partnerName, items, onClose }: Props) {
  const t = useTranslations('vintedPromote');
  const tCommon = useTranslations('common');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const bodyKey = items.length > 1
    ? 'partnerCleanupBodyMultiple'
    : items[0].kind === 'card'
      ? 'partnerCleanupBodyCard'
      : 'partnerCleanupBodyLot';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border-border w-full max-w-md rounded-lg border p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="bg-red/15 text-red flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">{t('partnerCleanupTitle', { name: partnerName })}</h2>
            {items.length === 1 ? (
              <p className="text-text-muted mt-1 text-sm">{items[0].displayName}</p>
            ) : (
              <ul className="text-text-muted mt-1 space-y-0.5 text-sm">
                {items.map((item, i) => (
                  <li key={i}>· {item.displayName}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-3 text-sm">
          <p>{t(bodyKey)}</p>
          <p className="text-text-muted">
            {t('partnerCleanupNote', { name: partnerName })}
          </p>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="bg-red text-bg rounded px-4 py-1.5 text-sm font-medium hover:opacity-90"
          >
            {tCommon('understood')}
          </button>
        </div>
      </div>
    </div>
  );
}
