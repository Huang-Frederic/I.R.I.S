// components/cards/DuplicateForSaleModal.tsx
'use client';

import { AlertTriangle, X } from 'lucide-react';

interface Props {
  message: string;
  onClose: () => void;
}

export default function DuplicateForSaleModal({ message, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-surface border-border w-full max-w-md rounded-lg border p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-rarity-ar mt-0.5 h-6 w-6 shrink-0" aria-hidden />
            <h2 className="text-lg font-semibold">Carte déjà en vente</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-text-muted mb-5 text-sm">{message}</p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="bg-red text-bg rounded px-4 py-1.5 text-sm font-medium hover:opacity-90"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
