// components/vinted/RestockToast.tsx
'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, X } from 'lucide-react';
import type { RestockAlert } from '@/lib/utils/restock-detection';

interface Props {
  alert: RestockAlert;
  onDismiss: () => void;
}

const DISMISS_AFTER_MS = 5000;

export default function RestockToast({ alert, onDismiss }: Props) {
  useEffect(() => {
    const t = setTimeout(onDismiss, DISMISS_AFTER_MS);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      role="alert"
      className="bg-surface border-red fixed bottom-6 right-6 z-50 flex max-w-sm items-start gap-3 rounded-lg border p-4 shadow-xl"
    >
      <AlertTriangle className="text-red mt-0.5 h-5 w-5 shrink-0" />
      <div className="flex-1 text-sm">
        <p className="font-medium">Plus de stock pour {alert.pokemon_name}</p>
        <p className="text-text-muted mt-1 text-xs">
          Ta carte Pokédex est exposée. <Link href="/pokedex" className="text-red underline">Vérifier le Pokédex</Link>
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="text-text-muted hover:text-text"
        aria-label="Fermer"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
