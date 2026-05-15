'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Globe, GlobeLock, AlertTriangle, RefreshCw } from 'lucide-react';
import type { BaseListing } from '@/lib/types';
import {
  getMyListing,
  getPartnerListing,
  isStaleForListing,
} from '@/lib/utils/listings';
import { badgeClassesForColor, colorForUserName } from '@/lib/utils/user-colors';
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
  const t = useTranslations('listingBadges');
  const [now] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const [confirmPostOnline, setConfirmPostOnline] = useState(false);
  const [confirmTakeOffline, setConfirmTakeOffline] = useState(false);

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

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {mine && !stale && (
          <button
            type="button"
            onClick={() => setConfirmTakeOffline(true)}
            disabled={busy}
            title={t('takeOfflineTitle')}
            aria-label={t('takeOfflineTitle')}
            className="bg-rarity-r/20 text-rarity-r hover:bg-rarity-r/30 inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors disabled:opacity-50"
          >
            <Globe className="h-3 w-3" />
            <span className="hidden sm:inline">{t('listedByMe', { days: daysSince(mine.listed_at, now) })}</span>
          </button>
        )}

        {mine && stale && (
          <button
            type="button"
            onClick={() => setConfirmRefresh(true)}
            disabled={busy}
            title={t('staleTitle')}
            aria-label={t('stale', { days: daysSince(mine.listed_at, now) })}
            className="bg-red text-bg inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCw className="h-3 w-3" />
            <span className="hidden sm:inline">{t('stale', { days: daysSince(mine.listed_at, now) })}</span>
          </button>
        )}

        {partner && partnerName && (
          <span
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${badgeClassesForColor(partnerColor)}`}
            title={t('listedByPartner', { name: partnerName })}
          >
            <Globe className="h-3 w-3" />
            <span className="hidden sm:inline">{t('listedByPartner', { name: partnerName })}</span>
          </span>
        )}

        {toDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
            aria-label={t('toRetire')}
            title={t('toRetire')}
            className="bg-red text-bg inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:opacity-90 disabled:opacity-50"
          >
            <AlertTriangle className="h-3 w-3" />
            <span className="hidden sm:inline">{t('toRetire')}</span>
          </button>
        )}

        {!mine && (
          <button
            type="button"
            onClick={() => setConfirmPostOnline(true)}
            disabled={busy}
            aria-label={t('putOnline')}
            title={t('putOnline')}
            className="bg-rarity-ar/20 text-rarity-ar hover:bg-rarity-ar/30 inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors disabled:opacity-50"
          >
            <GlobeLock className="h-3 w-3" />
            <span className="hidden sm:inline">{t('putOnline')}</span>
          </button>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title={t('deleteConfirmTitle')}
          body={
            toDelete
              ? (itemKind === 'card' ? t('deleteConfirmBodyCard') : t('deleteConfirmBodyLot'))
              : (itemKind === 'card' ? t('deleteConfirmBodyDefault') : t('deleteConfirmBodyDefaultLot'))
          }
          confirmLabel={t('deleteConfirmAction')}
          confirmTone="danger"
          busy={busy}
          onConfirm={deleteListing}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      {confirmRefresh && mine && (
        <ConfirmDialog
          title={t('refreshConfirmTitle')}
          body={t('refreshConfirmBody', { days: daysSince(mine.listed_at, now) })}
          confirmLabel={t('refreshConfirmAction')}
          busy={busy}
          onConfirm={async () => {
            await postListing();
            setConfirmRefresh(false);
          }}
          onCancel={() => setConfirmRefresh(false)}
        />
      )}

      {confirmPostOnline && (
        <ConfirmDialog
          title={t('postOnlineConfirmTitle')}
          body={t('postOnlineConfirmBody')}
          confirmLabel={t('postOnlineConfirmAction')}
          busy={busy}
          onConfirm={async () => {
            await postListing();
            setConfirmPostOnline(false);
          }}
          onCancel={() => setConfirmPostOnline(false)}
        />
      )}

      {confirmTakeOffline && mine && (
        <ConfirmDialog
          title={t('takeOfflineConfirmTitle')}
          body={t('takeOfflineConfirmBody')}
          confirmLabel={t('takeOfflineConfirmAction')}
          confirmTone="danger"
          busy={busy}
          onConfirm={async () => {
            await deleteListing();
            setConfirmTakeOffline(false);
          }}
          onCancel={() => setConfirmTakeOffline(false)}
        />
      )}
    </>
  );
}
