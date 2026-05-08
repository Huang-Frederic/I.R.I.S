'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';

interface Props {
  cardId: string;
  initialPrice: number | null;
  onSaved: (newPrice: number | null) => void;
  /** Override the default endpoint `/api/cards/${cardId}`. Lot rows pass `/api/lots/${lotId}`. */
  endpoint?: string;
  /** Override the field name in the PATCH body. Defaults to 'suggested_price' (cards). Lots use 'price'. */
  priceField?: 'suggested_price' | 'price';
}

export default function EditablePriceCell({ cardId, initialPrice, onSaved, endpoint, priceField }: Props) {
  const [price, setPrice] = useState<number | null>(initialPrice);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(initialPrice !== null ? String(initialPrice) : '');
  const [saving, setSaving] = useState(false);

  const commit = async () => {
    setSaving(true);
    const parsed = draft.trim() === '' ? null : Number(draft.replace(',', '.'));
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      setDraft(price !== null ? String(price) : '');
      setSaving(false);
      setEditing(false);
      return;
    }
    try {
      const url = endpoint ?? `/api/cards/${cardId}`;
      const field = priceField ?? 'suggested_price';
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [field]: parsed }),
      });
      if (!res.ok) throw new Error('save failed');
      setPrice(parsed);
      onSaved(parsed);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        inputMode="decimal"
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(price !== null ? String(price) : '');
            setEditing(false);
          }
        }}
        className="bg-surface-2 border-border focus:border-red w-20 rounded border px-2 py-1 text-right font-mono text-xs outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="text-text hover:text-red group inline-flex items-center gap-1 font-mono text-sm font-medium"
    >
      <span className={price !== null ? 'text-rarity-sr' : 'text-text-faint'}>
        {price !== null ? `${price.toFixed(2)} €` : '—'}
      </span>
      <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
    </button>
  );
}
