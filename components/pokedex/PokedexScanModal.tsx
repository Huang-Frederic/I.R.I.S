'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import CardScanForm from '@/components/submit/CardScanForm';

interface Props {
  pokemonNumber: number;
  onClose: () => void;
}

export default function PokedexScanModal({ pokemonNumber, onClose }: Props) {
  const t = useTranslations('pokedex');
  const router = useRouter();

  // Escape closes the modal. Backdrop click also closes — note the modal
  // wraps a multi-step CardScanForm, so a stray click outside loses any
  // unsubmitted scan data. Acceptable trade-off per the platform-wide UX rule
  // that a modal must always be dismissible by clicking outside.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border-border my-6 w-full max-w-2xl rounded-lg border shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-border bg-surface sticky top-0 flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-base font-semibold">
            {t('scanModalTitle')}
            <span className="text-text-faint ml-2 font-mono text-xs">
              #{pokemonNumber.toString().padStart(4, '0')}
            </span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('drawerCloseInnerAria')}
            className="text-text-muted hover:text-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          <CardScanForm
            lockedPokemonNumber={pokemonNumber}
            lockedStatus="pokedex"
            compact
            onCancel={onClose}
            onSaved={() => {
              onClose();
              router.refresh();
            }}
          />
        </div>
      </div>
    </div>
  );
}
