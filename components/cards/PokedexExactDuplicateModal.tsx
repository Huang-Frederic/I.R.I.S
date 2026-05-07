// components/cards/PokedexExactDuplicateModal.tsx
'use client';

import { X } from 'lucide-react';

interface ExistingCardLite {
  id: string;
  image_url: string | null;
  tcg_image_url: string | null;
  card_name: string | null;
  pokemon_name: string | null;
  set_name: string | null;
  set_code: string | null;
  set_number: string | null;
  language: string;
  condition: string;
  variant: string | null;
  rarity: string;
}

interface Props {
  existingCard: ExistingCardLite;
  /** Quantity from the form — used to label the "Add to Stock" button. */
  qty?: number;
  onAddToStock: () => Promise<void>;
  onCancel: () => void;
}

export default function PokedexExactDuplicateModal({ existingCard, qty = 1, onAddToStock, onCancel }: Props) {
  const imageSrc = existingCard.image_url ?? existingCard.tcg_image_url ?? '';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div role="dialog" aria-modal="true" className="bg-surface border-border w-full max-w-md rounded-lg border p-5">
        <div className="flex items-start justify-between">
          <h3 className="text-text text-lg font-semibold">Carte déjà dans le Pokédex</h3>
          <button type="button" onClick={onCancel} aria-label="Fermer" className="text-text-muted hover:text-text">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-text-muted mt-2 text-sm">
          Cette carte exacte (même set, langue, état, variante) est déjà ta vitrine Pokédex. Tu peux l&apos;ajouter à ton Stock comme copie supplémentaire.
        </p>
        <div className="mt-4 flex items-start gap-3 rounded-md border border-border bg-surface-2 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageSrc} alt="" className="h-20 w-14 rounded object-cover" />
          <div className="min-w-0 flex-1 text-sm">
            <div className="text-text truncate font-medium">{existingCard.card_name}</div>
            <div className="text-text-muted mt-0.5 text-xs">
              {existingCard.set_name ?? existingCard.set_code} · {existingCard.language} · {existingCard.condition}
            </div>
            {existingCard.variant && (
              <div className="text-text-muted mt-0.5 text-xs">Variant: {existingCard.variant}</div>
            )}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="text-text-muted hover:bg-surface-2 rounded-md px-3 py-1.5 text-sm transition-colors">
            Annuler
          </button>
          <button type="button" onClick={onAddToStock} className="bg-red text-white hover:opacity-90 rounded-md px-3 py-1.5 text-sm font-medium transition-opacity">
            {qty > 1 ? `Ajouter ${qty} copies au Stock` : 'Ajouter à mon Stock'}
          </button>
        </div>
      </div>
    </div>
  );
}
