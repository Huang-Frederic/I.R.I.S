'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { translateErrorCode } from '@/lib/utils/translate-error';

export default function ManualBackupButton() {
  const router = useRouter();
  const t = useTranslations('options');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/backup/manual', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        const localized = translateErrorCode(tErrors, json.error);
        setError(localized ?? json.message ?? json.error ?? `${tCommon('error')} ${res.status}`);
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={busy}
        className="bg-red text-bg inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors hover:opacity-90 disabled:opacity-60"
      >
        {busy ? t('backupCreating') : t('backupCreateButton')}
      </button>

      {error && <p className="text-red mt-2 text-xs">{error}</p>}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div
            className="bg-surface border-border w-full max-w-md rounded-lg border p-5"
            role="dialog"
            aria-modal="true"
          >
            <h3 className="text-text text-lg font-semibold">{t('backupConfirmTitle')}</h3>
            <p className="text-text-muted mt-2 text-sm">{t('backupConfirmBody')}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={busy}
                className="text-text-muted hover:bg-surface-2 rounded-md px-3 py-1.5 text-sm transition-colors"
              >
                {tCommon('cancel')}
              </button>
              <button
                type="button"
                onClick={run}
                disabled={busy}
                className="bg-red text-bg rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-90 disabled:opacity-60"
              >
                {busy ? '…' : tCommon('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
