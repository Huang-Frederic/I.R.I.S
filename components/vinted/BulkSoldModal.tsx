'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { Card, Lot } from '@/lib/types';
import { splitPrice } from '@/lib/utils/split-bulk-price';

export type BulkSoldItem =
  | { kind: 'card'; card: Card }
  | { kind: 'lot'; lot: Lot };

interface Props {
  items: BulkSoldItem[];
  onClose: () => void;
  onConfirm: (totalPrice: number, dateSold: string) => Promise<void>;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function thumbUrl(item: BulkSoldItem): string | null {
  if (item.kind === 'card') {
    if (item.card.image_url) return item.card.image_url;
    if (item.card.tcg_image_url) return item.card.tcg_image_url;
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${item.card.pokemon_number}.png`;
  }
  // Lot: first photo if any (resolve to public URL via Storage)
  if (item.lot.photo_urls.length === 0) return null;
  const path = item.lot.photo_urls[0];
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/lot-photos/${path}`;
}

function displayName(item: BulkSoldItem): string {
  return item.kind === 'card' ? item.card.card_name : item.lot.name;
}

function displaySubText(item: BulkSoldItem): string {
  if (item.kind === 'card') {
    return `${item.card.language} · ${item.card.condition}`;
  }
  return `Lot${item.lot.language ? ' · ' + item.lot.language : ''}${item.lot.condition ? ' · ' + item.lot.condition : ''}`;
}

export default function BulkSoldModal({ items, onClose, onConfirm }: Props) {
  const [priceStr, setPriceStr] = useState('');
  const [date, setDate] = useState(todayIso());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalPrice = useMemo(() => {
    const parsed = priceStr.trim() === '' ? 0 : Number(priceStr.replace(',', '.'));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }, [priceStr]);

  const perItem = useMemo(() => {
    if (totalPrice <= 0 || items.length === 0) return null;
    return splitPrice(totalPrice, items.length);
  }, [totalPrice, items.length]);

  const valid = totalPrice > 0 && items.length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(totalPrice, new Date(`${date}T12:00:00Z`).toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-surface border-border w-full max-w-lg rounded-lg border p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Vente groupée</h2>
            <p className="text-text-muted mt-1 text-sm">{items.length} items à marquer comme vendus</p>
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

        <ul className="mb-4 max-h-60 space-y-1.5 overflow-y-auto pr-1">
          {items.map((item, i) => {
            const thumb = thumbUrl(item);
            return (
              <li key={`${item.kind}-${item.kind === 'card' ? item.card.id : item.lot.id}`} className="bg-surface-2 flex items-center gap-2 rounded p-2 text-sm">
                {thumb ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={thumb} alt="" className="bg-surface-off h-10 w-7 shrink-0 rounded object-cover" />
                ) : (
                  <div className="bg-surface-off h-10 w-7 shrink-0 rounded" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {item.kind === 'lot' && <span className="bg-rarity-chr/20 text-rarity-chr mr-1.5 rounded px-1 py-0.5 text-[10px]">Lot</span>}
                    {displayName(item)}
                  </p>
                  <p className="text-text-muted text-xs">{displaySubText(item)}</p>
                </div>
                {perItem && (
                  <p className="text-rarity-sr shrink-0 font-mono text-xs">
                    {perItem[i].toFixed(2)} €
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="text-text-muted text-xs">Prix total reçu (€)</span>
            <input
              type="text"
              inputMode="decimal"
              value={priceStr}
              onChange={(e) => setPriceStr(e.target.value)}
              placeholder="100.00"
              autoFocus
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

          {perItem && totalPrice > 0 && (
            <p className="text-text-muted text-xs">
              Réparti : {perItem.length === 1
                ? `${perItem[0].toFixed(2)} €`
                : `${perItem[0].toFixed(2)} € × ${perItem.length - 1} + ${perItem[perItem.length - 1].toFixed(2)} € (dernier)`}
            </p>
          )}

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
              disabled={!valid || submitting}
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
