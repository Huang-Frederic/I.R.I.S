'use client';

import { useState } from 'react';
import { X, Trash2, Tag, Package } from 'lucide-react';
import type { Card } from '@/lib/types';

interface Props {
  card: Card;
  /** True if a for_sale card of the same group already exists. Disables "Vers Vinted". */
  hasForSaleConflict: boolean;
  onClose: () => void;
  onDone: () => void;
}

export default function PokedexCardActionsModal({ card, hasForSaleConflict, onClose, onDone }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const moveTo = async (status: 'for_sale' | 'collection') => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Action échouée (${res.status})`);
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setSubmitting(false);
    }
  };

  const remove = async () => {
    if (!confirm('Supprimer cette carte définitivement ? Cette action est irréversible.')) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/cards/${card.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Suppression échouée (${res.status})`);
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-surface border-border w-full max-w-md rounded-lg border p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Retirer cette carte du Pokédex</h2>
            <p className="text-text-muted mt-1 text-sm">{card.card_name}</p>
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

        {error && <p className="text-red mb-3 text-xs">{error}</p>}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => moveTo('collection')}
            disabled={submitting}
            className="bg-surface-2 hover:bg-surface-off border-border inline-flex items-center justify-center gap-2 rounded border px-4 py-2 text-sm disabled:opacity-50"
          >
            <Package className="h-4 w-4" />
            Déplacer vers Stock
          </button>

          <button
            type="button"
            onClick={() => moveTo('for_sale')}
            disabled={submitting || hasForSaleConflict}
            title={hasForSaleConflict ? 'Un exemplaire est déjà en vente — Stock obligatoire' : undefined}
            className="bg-surface-2 hover:bg-surface-off border-border inline-flex items-center justify-center gap-2 rounded border px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Tag className="h-4 w-4" />
            Déplacer vers Vinted
          </button>

          <button
            type="button"
            onClick={remove}
            disabled={submitting}
            className="bg-red text-bg inline-flex items-center justify-center gap-2 rounded px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Supprimer définitivement
          </button>
        </div>

        <p className="text-text-faint mt-3 text-xs">
          Le slot Pokédex sera libéré, tu pourras y mettre une autre carte.
        </p>
      </div>
    </div>
  );
}
