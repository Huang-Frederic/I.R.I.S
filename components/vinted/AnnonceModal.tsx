// components/vinted/AnnonceModal.tsx
'use client';

import { useEffect, useState } from 'react';
import { Copy, X, Check } from 'lucide-react';
import type { Card } from '@/lib/types';
import { buildTitle, buildDescription, MAX_TITLE_LENGTH, type VintedConfig } from '@/lib/utils/vinted-template';

interface Props {
  card: Card;
  config: VintedConfig;
  onClose: () => void;
  onPriceSaved: (cardId: string, newPrice: number | null) => void;
}

export default function AnnonceModal({ card, config, onClose, onPriceSaved }: Props) {
  const [title, setTitle] = useState<string>(() => buildTitle(card));
  const [description, setDescription] = useState<string>(() => buildDescription(card, config));
  const [vintedPrice, setVintedPrice] = useState<string>(
    card.suggested_price !== null ? String(card.suggested_price) : '',
  );
  const [copiedField, setCopiedField] = useState<'title' | 'desc' | null>(null);
  const [savingPrice, setSavingPrice] = useState(false);

  useEffect(() => {
    if (!copiedField) return;
    const t = setTimeout(() => setCopiedField(null), 1500);
    return () => clearTimeout(t);
  }, [copiedField]);

  const copy = async (text: string, field: 'title' | 'desc') => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
  };

  const persistPrice = async () => {
    const initial = card.suggested_price !== null ? String(card.suggested_price) : '';
    if (vintedPrice === initial) return; // no change
    const parsed = vintedPrice.trim() === '' ? null : Number(vintedPrice.replace(',', '.'));
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) return;
    setSavingPrice(true);
    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ suggested_price: parsed }),
      });
      if (res.ok) onPriceSaved(card.id, parsed);
    } finally {
      setSavingPrice(false);
    }
  };

  const close = async () => {
    await persistPrice();
    onClose();
  };

  const titleOver = title.length > MAX_TITLE_LENGTH;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-surface border-border max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-lg font-semibold">Annonce Vinted</h2>
          <button
            type="button"
            onClick={close}
            className="text-text-muted hover:text-text"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-[200px_1fr]">
          <div className="flex flex-col gap-2">
            {card.image_url && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={card.image_url} alt="Photo" className="bg-surface-off w-full rounded" />
            )}
            {card.tcg_image_url && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={card.tcg_image_url} alt="Image TCG" className="bg-surface-off w-full rounded" />
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-text-muted flex items-center justify-between text-xs">
                <span>Titre</span>
                <span className={`font-mono ${titleOver ? 'text-red' : ''}`}>
                  {title.length}/{MAX_TITLE_LENGTH}
                </span>
              </label>
              <textarea
                rows={2}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
              />
              <button
                type="button"
                onClick={() => copy(title, 'title')}
                className="bg-surface-2 hover:bg-surface-off border-border mt-1 inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs"
              >
                {copiedField === 'title' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedField === 'title' ? 'Copié' : 'Copier le titre'}
              </button>
            </div>

            <div>
              <label className="text-text-muted text-xs">Description</label>
              <textarea
                rows={9}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 font-mono text-xs outline-none"
              />
              <button
                type="button"
                onClick={() => copy(description, 'desc')}
                className="bg-surface-2 hover:bg-surface-off border-border mt-1 inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs"
              >
                {copiedField === 'desc' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedField === 'desc' ? 'Copié' : 'Copier la description'}
              </button>
            </div>

            <div className="border-border grid grid-cols-4 gap-2 rounded border p-3 text-center text-xs">
              <div>
                <p className="text-text-faint">Low</p>
                <p className="font-mono">{card.cm_price_low !== null ? `${card.cm_price_low.toFixed(2)}` : '—'}</p>
              </div>
              <div>
                <p className="text-text-faint">Trend</p>
                <p className="font-mono">{card.cm_price_trend !== null ? `${card.cm_price_trend.toFixed(2)}` : '—'}</p>
              </div>
              <div>
                <p className="text-text-faint">Avg</p>
                <p className="font-mono">{card.cm_price_avg !== null ? `${card.cm_price_avg.toFixed(2)}` : '—'}</p>
              </div>
              <div>
                <p className="text-text-faint">Suggéré</p>
                <p className="text-rarity-sr font-mono font-bold">
                  {card.suggested_price !== null ? `${card.suggested_price.toFixed(2)}` : '—'}
                </p>
              </div>
            </div>

            <label className="block">
              <span className="text-text-muted text-xs">Prix de vente Vinted (€) — persisté à la fermeture</span>
              <input
                type="text"
                inputMode="decimal"
                value={vintedPrice}
                disabled={savingPrice}
                onChange={(e) => setVintedPrice(e.target.value)}
                className="bg-surface-2 border-border focus:border-red mt-1 w-32 rounded border px-3 py-2 text-sm outline-none"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
