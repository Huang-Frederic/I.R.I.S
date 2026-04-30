// components/vinted/VintedListedToggle.tsx
'use client';

import { useState } from 'react';
import { Globe, GlobeLock, RefreshCw } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import { isListingStale, daysSinceListing } from '@/lib/utils/listing-stale';

interface Props {
  cardId: string;
  /** Current vinted_listed_at value (null = offline). */
  currentListedAt: string | null;
  onToggled: (listedAt: string | null) => void;
}

type State = 'offline' | 'online' | 'stale';

function computeState(listedAt: string | null, now: number): State {
  if (listedAt === null) return 'offline';
  return isListingStale(listedAt, now) ? 'stale' : 'online';
}

function formatDays(d: number): string {
  if (d <= 0) return "auj.";
  if (d > 99) return '99j+';
  return `${d}j`;
}

export default function VintedListedToggle({ cardId, currentListedAt, onToggled }: Props) {
  const [listed, setListed] = useState(currentListedAt);
  const [busy, setBusy] = useState(false);
  // Lazy-init now to avoid SSR/hydration mismatch
  const [now] = useState(() => Date.now());
  const [confirmKind, setConfirmKind] = useState<'offline' | 'refresh' | null>(null);

  const state = computeState(listed, now);
  const daysSince = daysSinceListing(listed, now);

  const setListedTo = async (next: string | null) => {
    if (busy) return;
    setBusy(true);
    setListed(next);
    setConfirmKind(null);
    try {
      const res = await fetch(`/api/cards/${cardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vinted_listed_at: next }),
      });
      if (!res.ok) throw new Error('toggle failed');
      onToggled(next);
    } catch (err) {
      console.error(err);
      setListed(listed); // rollback
    } finally {
      setBusy(false);
    }
  };

  const onClick = () => {
    if (busy) return;
    if (state === 'offline') {
      // Direct: offline → online (instant)
      void setListedTo(new Date().toISOString());
    } else if (state === 'online') {
      // Confirm before going offline (loses the date)
      setConfirmKind('offline');
    } else {
      // stale → confirm refresh
      setConfirmKind('refresh');
    }
  };

  // Visual config per state — labels embed the days-since count when relevant
  // so users can see at a glance how stale a listing is without hovering.
  const daysLabel = daysSince !== null ? ` · ${formatDays(daysSince)}` : '';
  const config = {
    offline: {
      icon: GlobeLock,
      label: 'Pas en ligne',
      className: 'bg-rarity-ar/20 text-rarity-ar',
      title: 'Pas en ligne sur Vinted (clic pour mettre en ligne)',
    },
    online: {
      icon: Globe,
      label: `En ligne${daysLabel}`,
      className: 'bg-rarity-r/20 text-rarity-r',
      title: 'En ligne sur Vinted (clic pour mettre hors ligne)',
    },
    stale: {
      icon: RefreshCw,
      label: `À rafraîchir${daysLabel}`,
      className: 'bg-rarity-sr/20 text-rarity-sr',
      title: `En ligne depuis ${daysSince} jours — clic pour rafraîchir la date`,
    },
  }[state];

  const Icon = config.icon;

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        title={config.title}
        aria-label={config.title}
        className={`shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-opacity hover:opacity-80 disabled:opacity-50 ${config.className}`}
      >
        <Icon className="h-3 w-3" />
        {config.label}
      </button>

      {confirmKind === 'offline' && (
        <ConfirmDialog
          title="Mettre cette carte hors ligne ?"
          body={
            listed ? (
              <>
                La date de mise en ligne <strong>({new Date(listed).toLocaleDateString('fr-FR')}, il y a {daysSince ?? 0} jours)</strong> sera perdue.
              </>
            ) : (
              <>La date de mise en ligne sera perdue.</>
            )
          }
          confirmLabel="Mettre hors ligne"
          confirmTone="danger"
          onConfirm={() => void setListedTo(null)}
          onCancel={() => setConfirmKind(null)}
          busy={busy}
        />
      )}

      {confirmKind === 'refresh' && (
        <ConfirmDialog
          title="Rafraîchir cette annonce ?"
          body={
            <>
              La date de mise en ligne sera <strong>fixée à aujourd&apos;hui</strong>. La carte ne sera plus dans &laquo; À rafraîchir &raquo;.
            </>
          }
          confirmLabel="Rafraîchir"
          onConfirm={() => void setListedTo(new Date().toISOString())}
          onCancel={() => setConfirmKind(null)}
          busy={busy}
        />
      )}
    </>
  );
}
