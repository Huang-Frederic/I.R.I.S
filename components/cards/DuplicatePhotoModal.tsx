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

type Status = 'for_sale' | 'pokedex' | 'collection';

interface Props {
  newPhoto: Blob;
  existingCard: ExistingCardLite;
  qty: number;
  /** What the user originally selected as the new card's destination. */
  intendedStatus: Status;
  /** Confirm: photoChoice = which photo to keep on the existing card; targetStatus = where the new copies go. */
  onConfirm: (photoChoice: 'new' | 'existing', targetStatus: Status) => Promise<void>;
  onCancel: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  for_sale: 'sur Vinted',
  pokedex: 'dans ton Pokédex',
  collection: 'dans ton Stock',
  sold: 'parmi tes ventes',
};

const STATUS_DEST_LABEL: Record<Status, string> = {
  for_sale: 'sur Vinted',
  pokedex: 'dans ton Pokédex',
  collection: 'dans ton Stock',
};

/**
 * If the new card's intended status is the SAME as the existing one, a unique
 * constraint blocks it (one pokedex per pokemon_number, one for_sale per group).
 * Fall back to Stock in that case so the modal's "Confirmer" can always succeed.
 */
function computeTargetStatus(intended: Status, existingStatus: string): Status {
  if (intended === 'pokedex' && existingStatus === 'pokedex') return 'collection';
  if (intended === 'for_sale' && existingStatus === 'for_sale') return 'collection';
  return intended;
}

export default function DuplicatePhotoModal({
  newPhoto,
  existingCard,
  qty,
  intendedStatus,
  onConfirm,
  onCancel,
}: Props) {
  const previewUrl = useMemo(() => URL.createObjectURL(newPhoto), [newPhoto]);
  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);

  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<'new' | 'existing'>('new');

  const targetStatus = computeTargetStatus(intendedStatus, existingCard.status);
  const existingLabel = STATUS_LABEL[existingCard.status] ?? `dans ton inventaire`;
  const destLabel = STATUS_DEST_LABEL[targetStatus];

  const existingImageSrc = existingCard.image_url ?? existingCard.tcg_image_url ?? '';
  const setLabel = existingCard.set_name ?? existingCard.set_code ?? '?';
  const qtyLabel = qty > 1 ? `${qty} copies` : '1 copie';

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm(selected, targetStatus);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-lg border border-border bg-surface p-5">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold text-text">
            Une carte identique est déjà {existingLabel}
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
          Une copie identique existe (même set, langue, état, variante).
          {' '}{qty > 1 ? `Les ${qty} copies` : 'La nouvelle copie'} ser{qty > 1 ? 'ont ajoutées' : 'a ajoutée'} {destLabel}.
        </p>

        {/* Card identity — shown ONCE; same info for both photos */}
        <div className="mt-4 rounded-md border border-border bg-surface-2 p-3 text-sm">
          <div className="font-medium text-text">{existingCard.card_name}</div>
          <div className="mt-0.5 text-xs text-text-muted">
            {setLabel} · {existingCard.language} · {existingCard.condition}
            {existingCard.variant && <> · {existingCard.variant}</>}
          </div>
        </div>

        {/* Photo comparison — click to choose */}
        <p className="mt-4 text-xs text-text-muted">Quelle photo garder sur la carte existante ?</p>
        <div className="mt-2 grid grid-cols-2 gap-3">
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
            {busy ? '…' : `Ajouter ${qtyLabel}`}
          </button>
        </div>
      </div>
    </div>
  );
}
