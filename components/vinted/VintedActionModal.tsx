'use client';

import { useState } from 'react';
import { X, ExternalLink, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface Props {
  listingId: string;
  cardId?: string;
  lotId?: string;
  name: string;
  postedAt: string | null;
  price: number | null;
  userId: string;
  onBumpQueued: (itemId: string, jobId: string) => void;
  onClose: () => void;
}

export default function VintedActionModal({
  listingId,
  cardId,
  lotId,
  name,
  postedAt,
  price,
  onBumpQueued,
  onClose,
}: Props) {
  const t = useTranslations('vintedAction');
  const [confirmingBump, setConfirmingBump] = useState(false);
  const [bumping, setBumping] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const postedLabel = postedAt
    ? (() => {
        const d = Math.floor((Date.now() - new Date(postedAt).getTime()) / (1000 * 60 * 60 * 24));
        return d === 0 ? t('today') : t('daysAgo', { count: d });
      })()
    : null;

  const handleViewListing = () => {
    window.open(`https://www.vinted.fr/items/${listingId}`, '_blank');
  };

  const handleBump = async () => {
    setBumping(true);
    setErrorMsg(null);
    try {
      const body = cardId ? { card_id: cardId } : { lot_id: lotId };
      const res = await fetch('/api/vinted/bump-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 201) {
        const { job_id } = await res.json();
        onBumpQueued((cardId ?? lotId)!, job_id);
        onClose();
      } else {
        const json = await res.json().catch(() => ({}));
        setBumping(false);
        setConfirmingBump(false);
        setErrorMsg(json?.error ?? t('bumpErrorApi'));
      }
    } catch {
      setBumping(false);
      setConfirmingBump(false);
      setErrorMsg(t('networkError'));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-text">{t('modalTitle')}</h2>
            <p className="mt-0.5 text-sm font-medium text-text">{name}</p>
            {postedLabel && (
              <p className="mt-0.5 text-xs text-text-muted">{t('postedAt', { label: postedLabel })}</p>
            )}
            {price !== null && (
              <p className="mt-0.5 text-xs text-text-muted">{t('price', { price })}</p>
            )}
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-text-muted hover:text-text" aria-label={t('closeAria')}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {confirmingBump ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-muted">{t('bumpConfirm')}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleBump}
                disabled={bumping}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-700 px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${bumping ? 'animate-spin' : ''}`} />
                {bumping ? t('bumping') : t('bumpYes')}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingBump(false)}
                disabled={bumping}
                className="flex-1 rounded-lg bg-surface-2 border border-border px-4 py-2.5 text-sm text-text-muted hover:text-text disabled:opacity-50"
              >
                {t('bumpCancel')}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handleViewListing}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-vinted px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 active:opacity-80"
            >
              <ExternalLink className="h-4 w-4" />
              {t('viewListing')}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingBump(true)}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-700 px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 active:opacity-80"
            >
              <RefreshCw className="h-4 w-4" />
              {t('bump')}
            </button>
          </div>
        )}

        {errorMsg && (
          <p className="mt-3 text-center text-xs text-red-500">{errorMsg}</p>
        )}
      </div>
    </div>
  );
}
