// components/vinted/SoldModal.tsx
'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import type { Card } from '@/lib/types';
import type { RestockAlert } from '@/lib/utils/restock-detection';

interface Props {
  card: Card;
  onClose: () => void;
  onSold: (info: { soldCardId: string; restock: RestockAlert | null }) => void;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function SoldModal({ card, onClose, onSold }: Props) {
  const [price, setPrice] = useState<string>('');
  const [date, setDate] = useState<string>(todayIso());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const parsedPrice = price.trim() === '' ? null : Number(price.replace(',', '.'));
      if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
        throw new Error('Prix invalide');
      }
      const res = await fetch(`/api/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'sold',
          sold_price: parsedPrice,
          date_sold: new Date(`${date}T12:00:00Z`).toISOString(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erreur serveur');
      onSold({ soldCardId: card.id, restock: json.restock ?? null });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-surface border-border w-full max-w-md rounded-lg border p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Marquer comme vendue</h2>
            <p className="text-text-muted mt-1 text-sm">{card.card_name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="text-text-muted text-xs">Prix de vente (€) — optionnel</span>
            <input
              type="text"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="—"
              className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
            />
          </label>

          <label className="block">
            <span className="text-text-muted text-xs">Date de vente</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
            />
          </label>

          {error && <p className="text-red text-xs">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="bg-surface-2 hover:bg-surface-off border-border rounded border px-4 py-1.5 text-sm"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bg-red text-bg rounded px-4 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Enregistrement…' : 'Confirmer la vente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
