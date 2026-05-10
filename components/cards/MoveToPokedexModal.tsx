'use client';

import { useState } from 'react';
import { X, BookmarkCheck, Package, Tag } from 'lucide-react';
import { VARIANT_LABEL } from '@/lib/utils/labels';
import { displayCardName, displaySetName } from '@/lib/utils/format-name';

interface ExistingPokedexCard {
  id: string;
  card_name: string;
  image_url: string | null;
  tcg_image_url: string | null;
  set_name: string | null;
  set_code: string | null;
  language: string;
  condition: string;
  rarity: string;
  variant: string | null;
}

interface Props {
  /** The card the user wants to promote into the Pokédex slot. */
  card: {
    id: string;
    card_name: string;
    image_url: string | null;
    tcg_image_url: string | null;
  };
  /**
   * Where the card lives right now. We surface this in the prompt so the user
   * understands what will move out of view.
   */
  currentLocation: 'Stock' | 'Vinted';
  onClose: () => void;
  /** Called once the card has successfully landed in the pokédex slot. */
  onPromoted: () => void;
}

/**
 * Drives the "Add to Pokédex" flow from the Stock and Vinted lists. The
 * happy path is a single PATCH; the conflict path (slot already occupied)
 * unfolds a second confirm asking where to send the displaced card.
 */
export default function MoveToPokedexModal({ card, currentLocation, onClose, onPromoted }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ExistingPokedexCard | null>(null);

  const thumb = card.image_url ?? card.tcg_image_url;

  const promote = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'pokedex' }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
          existingCard?: ExistingPokedexCard;
        };
        if (res.status === 409 && body.error === 'pokedex_slot_taken' && body.existingCard) {
          setConflict(body.existingCard);
          setSubmitting(false);
          return;
        }
        throw new Error(body.message ?? body.error ?? `Échec (${res.status})`);
      }
      onPromoted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setSubmitting(false);
    }
  };

  const swap = async (displaceTo: 'collection' | 'for_sale') => {
    if (!conflict) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/pokedex/replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          old_card_id: conflict.id,
          old_new_status: displaceTo,
          new_card_id: card.id,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        throw new Error(body.message ?? body.error ?? `Échec (${res.status})`);
      }
      onPromoted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setSubmitting(false);
    }
  };

  if (conflict) {
    const variantLabel = conflict.variant ? (VARIANT_LABEL[conflict.variant] ?? conflict.variant) : null;
    const conflictThumb = conflict.image_url ?? conflict.tcg_image_url;
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
        <div className="bg-surface border-border w-full max-w-md rounded-lg border p-6 shadow-xl">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold">Slot Pokédex déjà occupé</h2>
              <p className="text-text-muted mt-1 text-sm">
                Une autre carte de ce Pokémon est dans ton Pokédex. Où l&apos;envoyer pour faire la place ?
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="text-text-muted hover:text-text disabled:opacity-50"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="my-4 flex items-center gap-3">
            {conflictThumb ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={conflictThumb}
                alt={conflict.card_name}
                className="bg-surface-off h-[140px] w-[100px] shrink-0 rounded object-cover"
              />
            ) : (
              <div className="bg-surface-off flex h-[140px] w-[100px] shrink-0 items-center justify-center rounded text-xs text-text-faint">
                Pas d&apos;image
              </div>
            )}
            <div className="flex flex-col gap-1 text-sm">
              <p className="font-medium">{displayCardName(conflict)}</p>
              {displaySetName(conflict) && (
                <p className="text-text-muted text-xs">
                  {displaySetName(conflict)}{conflict.set_code ? ` (${conflict.set_code})` : ''}
                </p>
              )}
              <p className="text-text-muted text-xs">
                {conflict.language} · {conflict.rarity} · {conflict.condition}
                {variantLabel ? ` · ${variantLabel}` : ''}
              </p>
              <p className="text-rarity-r mt-1 text-xs">Actuellement dans le Pokédex</p>
            </div>
          </div>

          {error && <p className="text-red mb-3 text-xs">{error}</p>}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="bg-surface-2 hover:bg-surface-off border-border rounded border px-4 py-2 text-sm disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void swap('collection')}
              disabled={submitting}
              className="bg-surface-2 hover:bg-surface-off border-border inline-flex items-center justify-center gap-1.5 rounded border px-4 py-2 text-sm disabled:opacity-50"
            >
              <Package className="h-3.5 w-3.5" />
              Vers Stock
            </button>
            <button
              type="button"
              onClick={() => void swap('for_sale')}
              disabled={submitting}
              className="bg-red text-bg inline-flex items-center justify-center gap-1.5 rounded px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              <Tag className="h-3.5 w-3.5" />
              Vers Vinted
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-surface border-border w-full max-w-md rounded-lg border p-6 shadow-xl">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Ajouter au Pokédex&nbsp;?</h2>
            <p className="text-text-muted mt-1 text-sm">
              Cette carte sera retirée de <strong>{currentLocation}</strong> et placée dans le Pokédex.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-text-muted hover:text-text disabled:opacity-50"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="my-4 flex items-center gap-3">
          {thumb ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={thumb}
              alt={card.card_name}
              className="bg-surface-off h-[140px] w-[100px] shrink-0 rounded object-cover"
            />
          ) : (
            <div className="bg-surface-off flex h-[140px] w-[100px] shrink-0 items-center justify-center rounded text-xs text-text-faint">
              Pas d&apos;image
            </div>
          )}
          <p className="text-sm font-medium">{displayCardName(card)}</p>
        </div>

        {error && <p className="text-red mb-3 text-xs">{error}</p>}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="bg-surface-2 hover:bg-surface-off border-border rounded border px-4 py-2 text-sm disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void promote()}
            disabled={submitting}
            className="bg-red text-bg inline-flex items-center justify-center gap-1.5 rounded px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <BookmarkCheck className="h-3.5 w-3.5" />
            {submitting ? 'Patientez…' : 'Ajouter au Pokédex'}
          </button>
        </div>
      </div>
    </div>
  );
}
