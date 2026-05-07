// components/cards/DuplicatePhotoModal.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
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
  newPhoto: File;
  existingCard: ExistingCardLite;
  onConfirmKeepExisting: () => void;
  onConfirmSwap: () => Promise<void>;
  onCancel: () => void;
}

export default function DuplicatePhotoModal({
  newPhoto,
  existingCard,
  onConfirmKeepExisting,
  onConfirmSwap,
  onCancel,
}: Props) {
  const [selected, setSelected] = useState<'new' | 'existing'>('new');
  const [busy, setBusy] = useState(false);

  const previewUrl = useMemo(() => URL.createObjectURL(newPhoto), [newPhoto]);

  useEffect(() => {
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function handleConfirm() {
    if (selected === 'existing') {
      onConfirmKeepExisting();
    } else {
      setBusy(true);
      try {
        await onConfirmSwap();
      } finally {
        setBusy(false);
      }
    }
  }

  const existingPhotoSrc = existingCard.image_url ?? existingCard.tcg_image_url ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-surface border-border w-full max-w-2xl rounded-lg border p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-lg font-semibold">Cette carte existe déjà</h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="text-text-muted hover:text-text disabled:opacity-50"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-text-muted mb-4 text-sm">
          Tu as déjà cette carte exactement (même set, langue, état, variante, status). Choisis quelle photo garder.
        </p>

        {/* Card metadata summary */}
        <div className="text-text-muted mb-4 rounded border border-border bg-surface-2 p-3 text-sm">
          <p className="font-medium text-text">
            {existingCard.card_name ?? existingCard.pokemon_name ?? '—'}
          </p>
          <p className="text-xs">
            {existingCard.set_name ?? existingCard.set_code ?? '—'} · {existingCard.language} · {existingCard.condition}
            {existingCard.variant ? ` · ${existingCard.variant}` : ''}
          </p>
        </div>

        {/* Two-image grid */}
        <div className="mb-5 grid gap-4 md:grid-cols-2">
          {/* NEW photo */}
          <button
            type="button"
            onClick={() => setSelected('new')}
            disabled={busy}
            className={`group relative rounded-lg transition-all ${
              selected === 'new' ? 'border-2 border-red' : 'border-2 border-border'
            } overflow-hidden disabled:opacity-50`}
          >
            {previewUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={previewUrl}
                alt="Nouvelle photo"
                className="h-[240px] w-full rounded object-cover"
              />
            ) : (
              <div className="bg-surface-off h-[240px] w-full rounded" />
            )}
            <div className="bg-surface/90 absolute bottom-0 left-0 right-0 p-2 text-center text-xs backdrop-blur-sm">
              📸 <strong>Nouvelle</strong> (ce scan)
            </div>
          </button>

          {/* EXISTING photo */}
          <button
            type="button"
            onClick={() => setSelected('existing')}
            disabled={busy}
            className={`group relative rounded-lg transition-all ${
              selected === 'existing' ? 'border-2 border-red' : 'border-2 border-border'
            } overflow-hidden disabled:opacity-50`}
          >
            {existingPhotoSrc ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={existingPhotoSrc}
                alt="Photo existante"
                className="h-[240px] w-full rounded object-cover"
              />
            ) : (
              <div className="bg-surface-off h-[240px] w-full rounded" />
            )}
            <div className="bg-surface/90 absolute bottom-0 left-0 right-0 p-2 text-center text-xs backdrop-blur-sm">
              💾 <strong>Existante</strong> (déjà en DB)
            </div>
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="text-text-muted rounded border border-border px-4 py-1.5 text-sm transition-colors hover:bg-surface-2 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className="bg-red rounded px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Enregistrement…' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
}
