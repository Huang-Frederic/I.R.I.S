'use client';

import { useState } from 'react';
import { Boxes } from 'lucide-react';

interface Props {
  /** Current count of physical copies in Stock (status='collection') for the
   *  group this Vinted row belongs to. May be 0 — the chip stays visible so
   *  the user can ADD copies right from /vinted without going to /stock. */
  count: number;
  /** Apply a target count (>=0). Caller diffs against the current count and
   *  clones (target > count) or deletes (target < count) collection rows.
   *  target=0 means delete every collection row in the group. */
  onSetCount: (target: number) => void;
  busy?: boolean;
}

/**
 * Editable inline chip for the per-group Stock count, displayed on each
 * Vinted row. Same UX as the StockRow count input but compact (~70 px wide).
 *
 * Click the chip → number input. Blur or Enter commits. Escape reverts.
 * Negative values are rejected; 0 is allowed and triggers a "delete all
 * collection copies of this card" on the backend.
 */
export default function StockCountChip({ count, onSetCount, busy = false }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(count));
  const [lastSynced, setLastSynced] = useState(count);

  // Sync the draft when the parent reports a new count (after a clone/delete settles).
  if (count !== lastSynced) {
    setLastSynced(count);
    setDraft(String(count));
  }

  const commit = () => {
    setEditing(false);
    const parsed = parseInt(draft, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      setDraft(String(count));
      return;
    }
    if (parsed === count) return;
    onSetCount(parsed);
  };

  if (editing) {
    return (
      <span className="border-rarity-uc/50 bg-rarity-uc/10 text-rarity-uc inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs">
        <Boxes className="h-3 w-3" />
        <input
          type="number"
          min={0}
          max={99}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setDraft(String(count));
              setEditing(false);
            }
          }}
          autoFocus
          disabled={busy}
          className="bg-transparent w-10 border-0 p-0 text-xs focus:outline-none"
        />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => !busy && setEditing(true)}
      disabled={busy}
      title={count === 0 ? 'Cliquer pour ajouter des copies en stock' : `${count} copie${count > 1 ? 's' : ''} en stock — cliquer pour modifier`}
      className={`border-rarity-uc/40 bg-rarity-uc/10 text-rarity-uc inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs transition-colors hover:bg-rarity-uc/20 disabled:opacity-50 ${count === 0 ? 'opacity-60' : ''}`}
    >
      <Boxes className="h-3 w-3" />
      <span className="font-mono">× {count}</span>
    </button>
  );
}
