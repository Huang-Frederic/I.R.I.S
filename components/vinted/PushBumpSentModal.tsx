'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, Rocket } from 'lucide-react';
import Modal from '@/components/ui/Modal';

interface Props {
  /** Offline items sent for publishing. */
  pushed: number;
  /** Online items sent for repost (delete + republish). */
  bumped: number;
  /** Items that couldn't be queued (no price, race, etc.). */
  failed: number;
  errors: string[];
  onClose: () => void;
}

/**
 * Confirmation shown right after a bulk Push/Bump queues its jobs — tells the
 * user the selection was sent (the Vinted agent drains the queue in the
 * background). Any per-item failures are surfaced below.
 */
export default function PushBumpSentModal({ pushed, bumped, failed, errors, onClose }: Props) {
  const t = useTranslations('vintedSold');
  const sent = pushed + bumped;

  return (
    <Modal
      open
      onClose={onClose}
      ariaLabel={t('pushBumpSentTitle')}
      className="bg-surface border-border w-full max-w-md rounded-lg border p-6 shadow-xl"
    >
      <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
        <Rocket className="text-red h-5 w-5" />
        {t('pushBumpSentTitle')}
      </h2>
      {sent > 0 && <p className="text-text-muted mt-2 text-sm">{t('pushBumpSentBody', { pushed, bumped })}</p>}

      {failed > 0 && (
        <div className="bg-surface-2 border-red mt-4 rounded border p-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="text-red mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">{t('pushBumpFailed', { count: failed })}</p>
              {errors.length > 0 && (
                <ul className="text-text-muted mt-1 space-y-0.5 text-xs">
                  {errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="bg-red text-bg rounded px-4 py-1.5 text-sm font-medium hover:opacity-90"
        >
          {t('pushBumpSentClose')}
        </button>
      </div>
    </Modal>
  );
}
