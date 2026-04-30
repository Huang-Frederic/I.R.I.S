'use client';

import { useState } from 'react';
import { Globe, GlobeLock } from 'lucide-react';

interface Props {
  cardId: string;
  initialListed: boolean;
  onToggled: (listedAt: string | null) => void;
}

/** Click-to-toggle "is listed on Vinted.com". Optimistic + rollback on error. */
export default function VintedListedToggle({ cardId, initialListed, onToggled }: Props) {
  const [listed, setListed] = useState(initialListed);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy) return;
    const next = !listed;
    const nextValue = next ? new Date().toISOString() : null;
    setBusy(true);
    setListed(next); // optimistic
    try {
      const res = await fetch(`/api/cards/${cardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vinted_listed_at: nextValue }),
      });
      if (!res.ok) throw new Error('toggle failed');
      onToggled(nextValue);
    } catch (err) {
      console.error(err);
      setListed(!next); // rollback
    } finally {
      setBusy(false);
    }
  };

  const Icon = listed ? Globe : GlobeLock;
  const className = listed ? 'bg-rarity-r/20 text-rarity-r' : 'bg-rarity-ar/20 text-rarity-ar';
  const title = listed
    ? 'En ligne sur Vinted (clic pour retirer)'
    : 'Pas en ligne sur Vinted (clic pour marquer en ligne)';

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={title}
      aria-label={title}
      className={`shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-opacity hover:opacity-80 disabled:opacity-50 ${className}`}
    >
      <Icon className="h-3 w-3" />
      {listed ? 'En ligne' : 'Pas en ligne'}
    </button>
  );
}
