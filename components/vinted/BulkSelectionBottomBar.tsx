'use client';

import { ShoppingCart, X } from 'lucide-react';

interface Props {
  cardCount: number;
  lotCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

function pluralize(n: number, singular: string, plural?: string): string {
  return n === 1 ? `${n} ${singular}` : `${n} ${plural ?? singular + 's'}`;
}

function buildCounterText(cardCount: number, lotCount: number): string {
  if (cardCount === 0 && lotCount === 0) return 'Aucun item';
  if (cardCount > 0 && lotCount === 0) return pluralize(cardCount, 'carte');
  if (cardCount === 0 && lotCount > 0) return pluralize(lotCount, 'lot');
  return `${pluralize(cardCount, 'carte')} · ${pluralize(lotCount, 'lot')} · ${cardCount + lotCount} items au total`;
}

export default function BulkSelectionBottomBar({ cardCount, lotCount, onConfirm, onCancel }: Props) {
  const total = cardCount + lotCount;
  if (total === 0) return null;

  return (
    <div className="bg-surface border-border fixed inset-x-0 bottom-0 z-40 border-t shadow-lg md:left-[220px]">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 p-3">
        <p className="text-text text-sm font-medium">
          {buildCounterText(cardCount, lotCount)}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-text-muted hover:text-text inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm"
          >
            <X className="h-4 w-4" />
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="bg-red text-bg inline-flex items-center gap-1.5 rounded px-4 py-1.5 text-sm font-medium hover:opacity-90"
          >
            <ShoppingCart className="h-4 w-4" />
            Vendre la sélection ({total})
          </button>
        </div>
      </div>
    </div>
  );
}
