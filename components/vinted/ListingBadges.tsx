'use client';

import { useState } from 'react';
import { Globe, GlobeLock, AlertTriangle, X, RefreshCw } from 'lucide-react';
import type { BaseListing } from '@/lib/types';
import {
  getMyListing,
  getPartnerListing,
  isStaleForListing,
} from '@/lib/utils/listings';
import { badgeClassesForColor, colorForUserName } from '@/lib/utils/user-colors';
import ConfirmDialog from './ConfirmDialog';
import RetireListingModal from './RetireListingModal';

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
  // A listing created moments ago can show -0 because Math.floor of a tiny
  // negative number rounds down to -1. Clamp at 0 — '0j' reads better than
  // '-1j' or '-0j' for "today".
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / (1000 * 60 * 60 * 24)));
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
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const [retireOpen, setRetireOpen] = useState(false);

  const mine = getMyListing(listings, myUserId);
  const partner = getPartnerListing(listings, partnerUserId);
  const stale = isStaleForListing(mine, now);
  const toDelete = mine !== null && itemStatus !== 'for_sale';
  // Per design: my own badge is always the default green ("Moi"); only the
  // partner badge is tinted with their identity color (Lui blue / Elle pink).
  // From my POV I'm always "Moi" — never my own display name.
  const partnerColor = colorForUserName(partnerName);

  async function postListing() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: itemKind, id: itemId }),
      });
      if (res.ok) {
        onListed();
      } else {
        // Network/RLS failure is rare here but silent failure leaves the
        // user wondering why the badge didn't toggle. Surface to console
        // (visible in DevTools) — the row will reconcile on next refresh.
        const body = await res.text().catch(() => '');
        console.error(`POST /api/listings failed (${res.status}):`, body);
      }
    } catch (e) {
      console.error('POST /api/listings network error:', e);
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
      if (res.ok) {
        onUnlisted();
      } else {
        const body = await res.text().catch(() => '');
        console.error(`DELETE /api/listings/${itemKind}/${itemId} failed (${res.status}):`, body);
      }
    } catch (e) {
      console.error('DELETE /api/listings network error:', e);
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  /** Retire-to-Stock: PATCH status='collection' + DELETE my listing.
   *  Two sequential calls; first must succeed before the second. If the second
   *  fails the card is in the right status but the listing lingers — user can
   *  cleanup via the "À retirer" red button afterwards. */
  async function retireToStock() {
    if (busy) return;
    if (itemKind !== 'card') return; // lots don't transition to 'collection'
    setBusy(true);
    try {
      const patch = await fetch(`/api/cards/${itemId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'collection' }),
      });
      if (!patch.ok) {
        console.error(`PATCH /api/cards/${itemId} status=collection failed (${patch.status})`);
        return;
      }
      const del = await fetch(`/api/listings/${itemKind}/${itemId}`, { method: 'DELETE' });
      if (!del.ok) {
        console.error(`DELETE listing after stock-retire failed (${del.status})`);
      }
      onUnlisted();
    } catch (e) {
      console.error('retireToStock network error:', e);
    } finally {
      setBusy(false);
      setRetireOpen(false);
    }
  }

  /** Permanently delete the card (cascade-deletes all listings via FK). */
  async function deleteCard() {
    if (busy) return;
    if (itemKind !== 'card') return; // lots have their own delete flow
    setBusy(true);
    try {
      const res = await fetch(`/api/cards/${itemId}`, { method: 'DELETE' });
      if (!res.ok) {
        console.error(`DELETE /api/cards/${itemId} failed (${res.status})`);
        return;
      }
      onUnlisted();
    } catch (e) {
      console.error('deleteCard network error:', e);
    } finally {
      setBusy(false);
      setRetireOpen(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {mine && !stale && (
          <span className="bg-rarity-r/20 text-rarity-r inline-flex items-center gap-1 rounded px-1.5 py-0.5">
            <Globe className="h-3 w-3" />
            Listée par Moi · {daysSince(mine.listed_at, now)}j
          </span>
        )}

        {mine && stale && (
          <button
            type="button"
            onClick={() => setConfirmRefresh(true)}
            disabled={busy}
            title="Cliquer pour rafraîchir la date de mise en ligne (listed_at = now)"
            className="bg-red text-bg inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCw className="h-3 w-3" />
            À rafraîchir · {daysSince(mine.listed_at, now)}j
          </button>
        )}

        {partner && partnerName && (
          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${badgeClassesForColor(partnerColor)}`}>
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
            className="bg-rarity-ar/20 text-rarity-ar hover:bg-rarity-ar/30 inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors disabled:opacity-50"
          >
            <GlobeLock className="h-3 w-3" />
            Mettre en ligne
          </button>
        )}

        {/* Show retire X when:
         *  - cards: always (with or without my listing — user can always move to Stock or delete)
         *  - lots: only when I have a listing to retire
         *  Skip when toDelete (a separate "À retirer" button handles that state). */}
        {!toDelete && (itemKind === 'card' || mine) && (
          <button
            type="button"
            onClick={() => (itemKind === 'card' ? setRetireOpen(true) : setConfirmDelete(true))}
            disabled={busy}
            aria-label={mine ? 'Retirer mon annonce' : 'Retirer cette carte de Vinted'}
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

      {confirmRefresh && mine && (
        <ConfirmDialog
          title="Rafraîchir cette annonce ?"
          body={`Tu vas remettre la date de mise en ligne à aujourd'hui (actuellement ${daysSince(mine.listed_at, now)}j). Pense à pousser l'annonce sur Vinted.com en parallèle.`}
          confirmLabel="Rafraîchir"
          busy={busy}
          onConfirm={async () => {
            await postListing();
            setConfirmRefresh(false);
          }}
          onCancel={() => setConfirmRefresh(false)}
        />
      )}

      {retireOpen && (
        <RetireListingModal
          partnerName={partner ? partnerName : null}
          busy={busy}
          onStock={retireToStock}
          onDelete={deleteCard}
          onCancel={() => setRetireOpen(false)}
        />
      )}
    </>
  );
}
