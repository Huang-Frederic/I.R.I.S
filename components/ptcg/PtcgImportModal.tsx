'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Modal from '@/components/ui/Modal';
import PtcgImport from './PtcgImport';

/**
 * The import box in a modal, opened from the dashboard's Import button — no
 * page navigation. Backdrop, Escape and the X all close it; the paste is safe
 * because the draft is saved on every edit and restored on reopen.
 */
export default function PtcgImportModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (game: { id: string }) => void;
}) {
  const t = useTranslations('ptcg');
  const tCommon = useTranslations('common');
  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel={t('importTitle')}
      layout="bottom-sheet"
      className="bg-surface border-border flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border"
    >
      <div className="border-border flex items-start justify-between gap-3 border-b p-4">
        <div>
          <h2 className="text-base font-bold">{t('importTitle')}</h2>
          <p className="text-text-muted text-sm">{t('importSubtitle')}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={tCommon('close')}
          className="text-text-muted hover:text-text hover:bg-surface-2 -m-1 shrink-0 rounded-lg p-1.5 transition"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <div className="overflow-y-auto p-4">
        <PtcgImport onImported={onImported} />
      </div>
    </Modal>
  );
}
