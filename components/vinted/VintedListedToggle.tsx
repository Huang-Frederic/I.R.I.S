'use client';

import { useState } from 'react';
import { Globe, GlobeLock } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';

interface Props {
  cardId: string;
  initialListed: boolean;
  /** ISO timestamp when the card was last marked listed. Used in the offline-confirm dialog. */
  currentListedAt: string | null;
  onToggled: (listedAt: string | null) => void;
}

function computeDaysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

/** Click-to-toggle "is listed on Vinted.com". Optimistic + rollback on error. */
export default function VintedListedToggle({ cardId, initialListed, currentListedAt, onToggled }: Props) {
  const [listed, setListed] = useState(initialListed);
  const [busy, setBusy] = useState(false);
  const [confirmingOff, setConfirmingOff] = useState(false);
  const [daysSinceListed, setDaysSinceListed] = useState<number | null>(null);

  const requestToggle = () => {
    if (busy) return;
    if (listed) {
      setDaysSinceListed(computeDaysSince(currentListedAt));
      setConfirmingOff(true);
    } else {
      void doToggle(true); // straight on
    }
  };

  const doToggle = async (next: boolean) => {
    if (busy) return;
    const nextValue = next ? new Date().toISOString() : null;
    setBusy(true);
    setListed(next);
    setConfirmingOff(false);
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
      setListed(!next);
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
    <>
      <button
        type="button"
        onClick={requestToggle}
        disabled={busy}
        title={title}
        aria-label={title}
        className={`shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-opacity hover:opacity-80 disabled:opacity-50 ${className}`}
      >
        <Icon className="h-3 w-3" />
        {listed ? 'En ligne' : 'Pas en ligne'}
      </button>

      {confirmingOff && (
        <ConfirmDialog
          title="Mettre cette carte hors ligne ?"
          body={
            currentListedAt && daysSinceListed !== null ? (
              <>
                La date de mise en ligne <strong>({new Date(currentListedAt).toLocaleDateString('fr-FR')}, il y a {daysSinceListed} jours)</strong> sera perdue.
              </>
            ) : (
              <>La date de mise en ligne sera perdue.</>
            )
          }
          confirmLabel="Mettre hors ligne"
          confirmTone="danger"
          onConfirm={() => void doToggle(false)}
          onCancel={() => setConfirmingOff(false)}
          busy={busy}
        />
      )}
    </>
  );
}
