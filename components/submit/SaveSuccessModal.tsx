'use client';

import { CheckCircle2 } from 'lucide-react';

interface Props {
  /** Per-bucket counts of what was inserted in this save batch. */
  counts: { for_sale: number; pokedex: number; collection: number };
  /** Thumbnail of the card just saved. Either a remote URL (image_url /
   * tcg_image_url / PokeAPI sprite) or a blob URL from the local photo. */
  imageUrl: string | null;
  onClose: () => void;
}

/**
 * Modal shown after a successful save in CardScanForm.
 *
 * Replaces the old inline "Carte enregistrée." line — when scanning qty=10
 * with finalStatus='for_sale', we want a clear acknowledgement that 1 went
 * to Vinted and 9 went to Stock, not a tiny success ribbon the user might
 * miss while waiting for the next scan to load.
 *
 * The auto-close is handled by the parent (calls onClose after a delay or
 * after onSaved fires the batch-mode advance), so the modal is purely
 * presentational.
 */
export default function SaveSuccessModal({ counts, imageUrl, onClose }: Props) {
  const lines: string[] = [];
  if (counts.for_sale > 0) lines.push(`${counts.for_sale} sur Vinted`);
  if (counts.pokedex > 0) lines.push(`${counts.pokedex} dans le Pokédex`);
  if (counts.collection > 0) lines.push(`${counts.collection} en Stock`);

  const total = counts.for_sale + counts.pokedex + counts.collection;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-surface border-border w-full max-w-md rounded-lg border p-6 shadow-xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="bg-rarity-r/15 text-rarity-r flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">
              {total > 1 ? `${total} exemplaires enregistrés` : 'Carte enregistrée'}
            </h2>
            <p className="text-text-muted mt-1 text-sm">Voici la répartition.</p>
          </div>
        </div>

        <ul className="mb-4 space-y-1.5">
          {lines.map((line) => (
            <li key={line} className="bg-surface-2 rounded px-3 py-2 text-sm">
              <CheckCircle2 className="text-rarity-r mr-2 inline h-3.5 w-3.5" />
              {line}
            </li>
          ))}
        </ul>

        {imageUrl && (
          <div className="mb-5 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Carte enregistrée"
              className="bg-surface-off h-[180px] w-[130px] rounded object-cover shadow"
            />
          </div>
        )}

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
