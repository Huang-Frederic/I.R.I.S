// components/cards/DuplicatePhotoModal.tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
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
  status: string;
}

interface Props {
  newPhoto: Blob;
  existingCard: ExistingCardLite;
  qty: number;
  /** Inserts qty in collection, keeps existing photo unchanged. */
  onAddToStock: () => Promise<void>;
  /** Inserts qty in collection AND swaps existing card's photo. */
  onAddToStockWithPhotoSwap: () => Promise<void>;
  onCancel: () => void;
}

function statusHeader(status: string): { title: string; sub: string } {
  if (status === 'for_sale') {
    return {
      title: 'Cette carte est déjà sur Vinted',
      sub: 'Une copie identique est en ligne. La nouvelle scan ira dans ton Stock.',
    };
  }
  if (status === 'pokedex') {
    return {
      title: 'Cette carte est déjà dans ton Pokédex',
      sub: 'C\'est exactement la même carte (set, langue, état, variante). La nouvelle scan ira dans ton Stock.',
    };
  }
  return {
    title: 'Cette carte est déjà dans ton Stock',
    sub: 'Tu en as déjà une copie identique. La nouvelle scan ajoutera des copies supplémentaires.',
  };
}

export default function DuplicatePhotoModal({
  newPhoto,
  existingCard,
  qty,
  onAddToStock,
  onAddToStockWithPhotoSwap,
  onCancel,
}: Props) {
  const previewUrl = useMemo(() => URL.createObjectURL(newPhoto), [newPhoto]);
  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);

  const [busy, setBusy] = useState(false);
  const { title, sub } = statusHeader(existingCard.status);
  const existingImageSrc = existingCard.image_url ?? existingCard.tcg_image_url ?? '';
  const qtyLabel = qty > 1 ? `${qty} copies` : '1 copie';

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-lg border border-border bg-surface p-5">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold text-text">{title}</h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Fermer"
            className="text-text-muted hover:text-text disabled:opacity-60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-sm text-text-muted">{sub}</p>

        {/* Existing card preview */}
        <div className="mt-4 flex items-start gap-3 rounded-md border border-border bg-surface-2 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={existingImageSrc} alt="" className="h-24 w-16 rounded object-cover" />
          <div className="min-w-0 flex-1 text-sm">
            <div className="truncate font-medium text-text">{existingCard.card_name}</div>
            <div className="mt-0.5 text-xs text-text-muted">
              {existingCard.set_name ?? existingCard.set_code} · {existingCard.language} · {existingCard.condition}
            </div>
            {existingCard.variant && (
              <div className="mt-0.5 text-xs text-text-muted">Variant: {existingCard.variant}</div>
            )}
            <div className="mt-1.5 text-xs text-text-faint">Photo actuelle ↑</div>
          </div>
        </div>

        {/* New photo preview (small) */}
        <div className="mt-2 flex items-start gap-3 rounded-md border border-border bg-surface-2 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="" className="h-24 w-16 rounded object-cover" />
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-medium text-text">Ta nouvelle scan</div>
            <div className="mt-1.5 text-xs text-text-faint">À utiliser pour remplacer la photo actuelle ?</div>
          </div>
        </div>

        {/* 3 buttons */}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md px-3 py-2 text-sm text-text-muted transition-colors hover:bg-surface-2 disabled:opacity-60 sm:order-1"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => run(onAddToStock)}
            disabled={busy}
            className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-surface disabled:opacity-60 sm:order-2"
          >
            {busy ? '…' : `Ajouter ${qtyLabel} au Stock`}
          </button>
          <button
            type="button"
            onClick={() => run(onAddToStockWithPhotoSwap)}
            disabled={busy}
            className="rounded-md bg-red px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60 sm:order-3"
          >
            {busy ? '…' : `Ajouter ${qtyLabel} + remplacer photo`}
          </button>
        </div>
      </div>
    </div>
  );
}
