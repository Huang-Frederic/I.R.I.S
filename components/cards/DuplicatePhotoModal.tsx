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
  /** Confirm with current selection: photo swap if 'new' is picked, no-op otherwise.
   *  Always inserts qty copies in collection regardless of photo choice. */
  onConfirm: (photoChoice: 'new' | 'existing') => Promise<void>;
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
  onConfirm,
  onCancel,
}: Props) {
  const previewUrl = useMemo(() => URL.createObjectURL(newPhoto), [newPhoto]);
  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);

  const [busy, setBusy] = useState(false);
  // Default selection = NEW (red border) — matches user's typical intent (re-scanning to update).
  const [selected, setSelected] = useState<'new' | 'existing'>('new');
  const { title, sub } = statusHeader(existingCard.status);
  const existingImageSrc = existingCard.image_url ?? existingCard.tcg_image_url ?? '';
  const qtyLabel = qty > 1 ? `${qty} copies` : '1 copie';

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm(selected);
    } finally {
      setBusy(false);
    }
  }

  // Single source of truth for card identity — shown ONCE at the top.
  const setLabel = existingCard.set_name ?? existingCard.set_code ?? '?';

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

        {/* Card identity — shown once. Same info applies to both photos. */}
        <div className="mt-4 rounded-md border border-border bg-surface-2 p-3 text-sm">
          <div className="font-medium text-text">{existingCard.card_name}</div>
          <div className="mt-0.5 text-xs text-text-muted">
            {setLabel} · {existingCard.language} · {existingCard.condition}
            {existingCard.variant && <> · {existingCard.variant}</>}
          </div>
        </div>

        {/* Photo comparison — click to choose which one to KEEP on the existing card */}
        <p className="mt-4 text-xs text-text-muted">Quelle photo garder sur la carte existante ?</p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setSelected('new')}
            disabled={busy}
            aria-pressed={selected === 'new'}
            className={`group flex flex-col items-center gap-2 rounded-md border-2 p-2 transition-colors ${
              selected === 'new' ? 'border-red bg-red/5' : 'border-border bg-surface-2 hover:border-text-faint'
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Nouvelle scan" className="h-40 w-auto rounded object-contain" />
            <span className={`text-xs font-medium ${selected === 'new' ? 'text-red' : 'text-text-muted'}`}>
              Nouvelle scan
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSelected('existing')}
            disabled={busy}
            aria-pressed={selected === 'existing'}
            className={`group flex flex-col items-center gap-2 rounded-md border-2 p-2 transition-colors ${
              selected === 'existing' ? 'border-red bg-red/5' : 'border-border bg-surface-2 hover:border-text-faint'
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={existingImageSrc} alt="Photo actuelle" className="h-40 w-auto rounded object-contain" />
            <span className={`text-xs font-medium ${selected === 'existing' ? 'text-red' : 'text-text-muted'}`}>
              Photo actuelle
            </span>
          </button>
        </div>

        <p className="mt-3 text-xs text-text-faint">
          Dans tous les cas, <span className="font-medium text-text-muted">{qtyLabel}</span> sera{qty > 1 ? 'nt' : ''} ajoutée{qty > 1 ? 's' : ''} à ton Stock.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md px-3 py-2 text-sm text-text-muted transition-colors hover:bg-surface-2 disabled:opacity-60"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="rounded-md bg-red px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy ? '…' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
}
