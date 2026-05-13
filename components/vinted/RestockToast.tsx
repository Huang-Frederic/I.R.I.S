'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AlertTriangle, X } from 'lucide-react';
import type { RestockAlert } from '@/lib/utils/restock-detection';
import { displayPokemonName } from '@/lib/utils/format-name';

interface Props {
  alert: RestockAlert;
  onDismiss: () => void;
}

const DISMISS_AFTER_MS = 5000;

export default function RestockToast({ alert, onDismiss }: Props) {
  const t = useTranslations('restockToast');
  const tCommon = useTranslations('common');
  useEffect(() => {
    const timer = setTimeout(onDismiss, DISMISS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      role="alert"
      className="bg-surface border-red fixed bottom-20 right-6 z-50 flex max-w-sm items-start gap-3 rounded-lg border p-4 shadow-xl md:bottom-6"
    >
      <AlertTriangle className="text-red mt-0.5 h-5 w-5 shrink-0" />
      <div className="flex-1 text-sm">
        <p className="font-medium">{t('title', { name: displayPokemonName(alert) })}</p>
        <p className="text-text-muted mt-1 text-xs">
          {t('body')}{' '}
          <Link href="/pokedex" className="text-red underline">{t('checkPokedex')}</Link>
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="text-text-muted hover:text-text"
        aria-label={tCommon('close')}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
