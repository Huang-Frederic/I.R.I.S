'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Check } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import type { RestockAlert } from '@/lib/utils/restock-detection';

interface Props {
  /** Number of cards successfully marked traded. */
  count: number;
  /** How many of them were silently replaced by a stock copy (auto-promote). */
  autoPromoted: number;
  restocks: RestockAlert[];
  onClose: () => void;
}

/**
 * Post-trade recap: confirms the batch, says how many listings were silently
 * taken over by a stock copy, and surfaces exposed-Pokédex alerts (same block
 * as BulkSoldRecapModal).
 */
export default function TradeRecapModal({ count, autoPromoted, restocks, onClose }: Props) {
  const t = useTranslations('vintedTrade');

  return (
    <Modal
      open
      onClose={onClose}
      ariaLabel={t('recapTitle')}
      className="bg-surface border-border w-full max-w-md rounded-lg border p-6 shadow-xl"
    >
      <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
        <Check className="text-red h-5 w-5" />
        {t('recapTitle')}
      </h2>
      <p className="text-text-muted mt-2 text-sm">{t('recapBody', { count })}</p>
      {autoPromoted > 0 && (
        <p className="text-text-muted mt-1 text-sm">{t('recapAutoPromoted', { count: autoPromoted })}</p>
      )}

      {restocks.length > 0 && (
        <div className="bg-surface-2 border-red mt-4 rounded border p-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="text-red mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">{t('recapRestockTitle', { count: restocks.length })}</p>
              <ul className="text-text-muted mt-1 space-y-0.5 text-xs">
                {restocks.map((r, i) => (
                  <li key={i}>{t('recapRestockExposed', { name: r.pokemon_name })}</li>
                ))}
              </ul>
              <Link href="/pokedex" className="text-red mt-1 inline-block text-xs underline">
                {t('recapRestockLink')}
              </Link>
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
          {t('recapContinue')}
        </button>
      </div>
    </Modal>
  );
}
