'use client';

import { AlertTriangle } from 'lucide-react';

interface Props {
  partnerName: string;
  /** Display name of the item that was just sold (card_name or lot.name). */
  itemDisplayName: string;
  itemKind: 'card' | 'lot';
  onClose: () => void;
}

/**
 * Final modal in the sold flow when there's no restock candidate AND the
 * partner has an active listing on the same card/lot. Tells the user that
 * the partner needs to manually pull their Vinted listing — IRIS can't
 * delete a listing on the partner's account.
 *
 * Triggered by VintedList AFTER the user has confirmed the sale and
 * dismissed any restock proposal. Not shown when restock is available
 * (the new for-sale row covers the partner's listing).
 */
export default function PartnerCleanupModal({ partnerName, itemDisplayName, itemKind, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-surface border-border w-full max-w-md rounded-lg border p-6 shadow-xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="bg-red/15 text-red flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Action requise pour {partnerName}</h2>
            <p className="text-text-muted mt-1 text-sm">{itemDisplayName}</p>
          </div>
        </div>

        <div className="space-y-3 text-sm">
          <p>
            {itemKind === 'card' ? 'Cette carte' : 'Ce lot'} est marquée comme vendue et il n&apos;y a pas
            d&apos;autre exemplaire à remettre en vente.
          </p>
          <p className="text-text-muted">
            {partnerName} devra retirer son annonce Vinted manuellement (IRIS ne peut pas
            supprimer une annonce sur un compte tiers).
          </p>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="bg-red text-bg rounded px-4 py-1.5 text-sm font-medium hover:opacity-90"
          >
            Compris
          </button>
        </div>
      </div>
    </div>
  );
}
