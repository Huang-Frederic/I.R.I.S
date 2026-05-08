'use client';
import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';

interface ExistingCardLite {
  id: string;
  image_url: string | null;
  tcg_image_url: string | null;
  card_name: string | null;
  set_name: string | null;
  set_code: string | null;
  language: string;
  condition: string;
  variant: string | null;
}

interface Props {
  newPhoto: Blob;
  existingCard: ExistingCardLite;
  /** Confirm with the photo choice. The caller continues the original submit
   *  flow afterwards (which may trigger PokedexReplaceModal / DuplicateForSaleModal
   *  for status conflicts). */
  onConfirm: (photoChoice: 'new' | 'existing') => Promise<void>;
  onCancel: () => void;
}

/**
 * Isolated photo-decision modal. Triggers when the scanned card already exists
 * anywhere in the user's inventory (cross-status). Asks ONLY about the photo —
 * the original "where does the new copy go" logic stays in
 * PokedexReplaceModal / DuplicateForSaleModal flows downstream.
 */
export default function DuplicatePhotoModal({
  newPhoto,
  existingCard,
  onConfirm,
  onCancel,
}: Props) {
  const previewUrl = useMemo(() => URL.createObjectURL(newPhoto), [newPhoto]);
  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);

  const [busy, setBusy] = useState(false);
  // NEW preselected — typical user intent when re-scanning is to update.
  const [selected, setSelected] = useState<'new' | 'existing'>('new');

  const existingImageSrc = existingCard.image_url ?? existingCard.tcg_image_url ?? '';
  const setLabel = existingCard.set_name ?? existingCard.set_code ?? '?';

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm(selected);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-lg border border-border bg-surface p-5">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold text-text">
            Cette carte possède déjà une illustration
          </h3>
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
        <p className="mt-2 text-sm text-text-muted">
          Quelle photo veux-tu garder pour cette carte ?
        </p>

        {/* Card identity reminder */}
        <div className="mt-4 rounded-md border border-border bg-surface-2 p-3 text-sm">
          <div className="font-medium text-text">{existingCard.card_name}</div>
          <div className="mt-0.5 text-xs text-text-muted">
            {setLabel} · {existingCard.language} · {existingCard.condition}
            {existingCard.variant && <> · {existingCard.variant}</>}
          </div>
        </div>

        {/* Photo comparison */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setSelected('new')}
            disabled={busy}
            aria-pressed={selected === 'new'}
            className={`flex flex-col items-center gap-2 rounded-md border-2 p-2 transition-colors ${
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
            className={`flex flex-col items-center gap-2 rounded-md border-2 p-2 transition-colors ${
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
