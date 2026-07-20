'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Boxes } from 'lucide-react';
import { translateErrorCode } from '@/lib/utils/translate-error';

interface Props {
  lotId: string;
  quantity: number;
  onSaved: (lotId: string, quantity: number) => void;
}

/**
 * Editable inline chip for a lot's quantity (number of identical copies).
 * Same UX as StockCountChip, but lots persist quantity as a column — one
 * PATCH instead of clone/delete row juggling. Minimum 1 (a lot with zero
 * copies is a deletion, not a quantity).
 */
export default function LotQuantityChip({ lotId, quantity, onSaved }: Props) {
  const t = useTranslations('lots');
  const tErrors = useTranslations('errors');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(quantity));
  const [lastSynced, setLastSynced] = useState(quantity);
  const [busy, setBusy] = useState(false);

  // Re-sync the draft when the parent state changes (e.g. after a split sale).
  if (quantity !== lastSynced) {
    setLastSynced(quantity);
    setDraft(String(quantity));
  }

  const commit = async () => {
    setEditing(false);
    const parsed = parseInt(draft, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      setDraft(String(quantity));
      return;
    }
    if (parsed === quantity) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/lots/${lotId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quantity: parsed }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(translateErrorCode(tErrors, json.error) ?? json.message ?? tErrors('unexpected'));
        setDraft(String(quantity));
        return;
      }
      onSaved(lotId, parsed);
    } catch {
      setDraft(String(quantity));
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <span className="border-rarity-uc/50 bg-rarity-uc/10 text-rarity-uc inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs">
        <Boxes className="h-3 w-3" />
        <input
          type="number"
          min={1}
          max={99}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setDraft(String(quantity));
              setEditing(false);
            }
          }}
          autoFocus
          disabled={busy}
          className="w-10 border-0 bg-transparent p-0 text-xs focus:outline-none"
        />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => !busy && setEditing(true)}
      disabled={busy}
      title={t('quantityChipTitle', { count: quantity })}
      className="border-rarity-uc/40 bg-rarity-uc/10 text-rarity-uc hover:bg-rarity-uc/20 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs transition-colors disabled:opacity-50"
    >
      <Boxes className="h-3 w-3" />
      <span className="font-mono">× {quantity}</span>
    </button>
  );
}
