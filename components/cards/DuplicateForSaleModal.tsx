// components/cards/DuplicateForSaleModal.tsx
'use client';

import { AlertTriangle, X } from 'lucide-react';

interface ExistingCardLite {
  id: string;
  card_name: string;
  image_url: string | null;
  tcg_image_url: string | null;
  suggested_price: number | null;
  date_added: string;
  language: string;
  condition: string;
  variant: string | null;
  set_name: string | null;
  set_code: string | null;
}

interface Props {
  /** When null, show a generic message without the existing card preview. */
  existingCard: ExistingCardLite | null;
  /** Called when the user confirms "Ajouter à mon Stock". The form should re-POST with status='collection'. */
  onConfirmCollection: () => void;
  /** Called when the user cancels (or clicks the X). */
  onCancel: () => void;
  /** How many physical copies the scanner is about to insert. Default 1. */
  count?: number;
  busy?: boolean;
}

export default function DuplicateForSaleModal({ existingCard, onConfirmCollection, onCancel, count = 1, busy = false }: Props) {
  const photoSrc = existingCard?.image_url ?? existingCard?.tcg_image_url ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-surface border-border w-full max-w-md rounded-lg border p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-rarity-ar mt-0.5 h-6 w-6 shrink-0" aria-hidden />
            <h2 className="text-lg font-semibold">Carte déjà en vente sur Vinted</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-text-muted hover:text-text"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {existingCard ? (
          <div className="mb-5 flex items-start gap-3 rounded border p-3 border-border">
            {photoSrc ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={photoSrc}
                alt={existingCard.card_name}
                className="bg-surface-off h-[100px] w-[72px] shrink-0 rounded object-cover"
              />
            ) : (
              <div className="bg-surface-off h-[100px] w-[72px] shrink-0 rounded" />
            )}
            <div className="min-w-0 flex-1 text-sm">
              <p className="truncate font-medium">{existingCard.card_name}</p>
              <p className="text-text-muted text-xs">
                {existingCard.set_name ?? existingCard.set_code ?? '—'}
              </p>
              <p className="text-text-muted mt-1 text-xs">
                {existingCard.language} · {existingCard.condition}
                {existingCard.variant ? ` · ${existingCard.variant}` : ''}
              </p>
              {existingCard.suggested_price !== null && (
                <p className="text-rarity-sr mt-1 font-mono text-sm font-bold">
                  {existingCard.suggested_price.toFixed(2)} €
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-text-muted mb-5 text-sm">
            Une carte identique est déjà en vente sur ton Vinted.
          </p>
        )}

        <p className="text-text-muted mb-5 text-sm">
          {count > 1 ? (
            <>
              Tu peux annuler, ou ajouter ces <strong>{count} exemplaires</strong> à ton <strong>Stock</strong> pour les mettre en vente plus tard.
            </>
          ) : (
            <>
              Tu peux annuler, ou ajouter cet exemplaire à ton <strong>Stock</strong> pour le mettre en vente plus tard.
            </>
          )}
        </p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="bg-surface-2 hover:bg-surface-off border-border rounded border px-4 py-1.5 text-sm disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirmCollection}
            disabled={busy}
            className="bg-red text-bg rounded px-4 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Enregistrement…' : count > 1 ? `Ajouter ${count} au Stock` : 'Ajouter à mon Stock'}
          </button>
        </div>
      </div>
    </div>
  );
}
