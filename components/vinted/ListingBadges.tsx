// components/vinted/ListingBadges.tsx
'use client';

import { useState } from 'react';
import { Globe, GlobeLock, AlertTriangle, X } from 'lucide-react';
import type { BaseListing } from '@/lib/types';
import {
  getMyListing,
  getPartnerListing,
  isStaleForListing,
} from '@/lib/utils/listings';
import ConfirmDialog from './ConfirmDialog';

interface Props {
  itemKind: 'card' | 'lot';
  itemId: string;
  itemStatus: string;
  listings: BaseListing[];
  myUserId: string;
  partnerUserId: string | null;
  partnerName: string | null;
  /** Called after a successful POST /api/listings — caller updates local state. */
  onListed: () => void;
  /** Called after a successful DELETE /api/listings/[kind]/[id]. */
  onUnlisted: () => void;
}

function daysSince(iso: string, now: number): number {
  return Math.floor((now - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

export default function ListingBadges({
  itemKind,
  itemId,
  itemStatus,
  listings,
  myUserId,
  partnerUserId,
  partnerName,
  onListed,
  onUnlisted,
}: Props) {
  const [now] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const mine = getMyListing(listings, myUserId);
  const partner = getPartnerListing(listings, partnerUserId);
  const stale = isStaleForListing(mine, now);
  const toDelete = mine !== null && itemStatus !== 'for_sale';

  async function postListing() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: itemKind, id: itemId }),
      });
      if (res.ok) onListed();
    } finally {
      setBusy(false);
    }
  }

  async function deleteListing() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/listings/${itemKind}/${itemId}`, {
        method: 'DELETE',
      });
      if (res.ok) onUnlisted();
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {mine && (
          <span className="bg-rarity-r/20 text-rarity-r inline-flex items-center gap-1 rounded px-1.5 py-0.5">
            <Globe className="h-3 w-3" />
            Listée par Moi · {daysSince(mine.listed_at, now)}j
            {stale && (
              <span className="bg-red text-bg ml-1 rounded px-1 py-0.5 text-[10px] font-medium">
                Stale
              </span>
            )}
          </span>
        )}

        {partner && partnerName && (
          <span className="bg-rarity-rr/20 text-rarity-rr inline-flex items-center gap-1 rounded px-1.5 py-0.5">
            <Globe className="h-3 w-3" />
            Listée par {partnerName}
          </span>
        )}

        {toDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
            className="bg-red text-bg inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:opacity-90 disabled:opacity-50"
          >
            <AlertTriangle className="h-3 w-3" />
            À retirer
          </button>
        )}

        {!mine && (
          <button
            type="button"
            onClick={postListing}
            disabled={busy}
            className="bg-surface-2 hover:bg-surface-off border-border inline-flex items-center gap-1 rounded border px-1.5 py-0.5 disabled:opacity-50"
          >
            <GlobeLock className="h-3 w-3" />
            Mettre en ligne
          </button>
        )}

        {mine && !toDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
            aria-label="Retirer mon annonce"
            className="text-text-muted hover:text-red inline-flex items-center rounded p-0.5 disabled:opacity-50"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Retirer ton annonce ?"
          body={
            toDelete
              ? `${itemKind === 'card' ? 'Cette carte' : 'Ce lot'} n'est plus disponible. Confirmer le retrait de ton annonce Vinted (côté IRIS) ?`
              : `Confirmer le retrait de ton annonce sur ${itemKind === 'card' ? 'cette carte' : 'ce lot'} ?`
          }
          confirmLabel="Retirer"
          confirmTone="danger"
          busy={busy}
          onConfirm={deleteListing}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
