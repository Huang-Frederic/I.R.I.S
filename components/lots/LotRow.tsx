'use client';

import { useTranslations } from 'next-intl';
import { Tag, Package } from 'lucide-react';
import type { Lot, BaseListing } from '@/lib/types';
import EditablePriceCell from '@/components/vinted/EditablePriceCell';
import ListingBadges from '@/components/vinted/ListingBadges';

interface Props {
  lot: Lot;
  storagePublicUrl: (path: string) => string;
  onAnnonceClick: (lot: Lot) => void;
  onSoldClick: (lot: Lot) => void;
  onPriceSaved: (lotId: string, newPrice: number | null) => void;
  listings: BaseListing[];
  myUserId: string;
  partnerUserId: string | null;
  partnerName: string | null;
  onListingsChanged: () => void;
  onImageClick?: (lot: Lot) => void;
  /** When true, show a checkbox on the left and disable Annonce/Vendu buttons. */
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

export default function LotRow({
  lot, storagePublicUrl, onAnnonceClick, onSoldClick, onPriceSaved, listings, myUserId, partnerUserId, partnerName, onListingsChanged, onImageClick, selectionMode, selected, onToggleSelect,
}: Props) {
  const t = useTranslations('lots');
  const thumb = lot.photo_urls.length > 0 ? storagePublicUrl(lot.photo_urls[0]) : null;

  return (
    <li className="bg-surface border-border flex flex-col gap-2 rounded-lg border p-2 text-sm sm:flex-row sm:items-center sm:gap-3 sm:p-3">
      <div className="flex items-center gap-3">
        {selectionMode && (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            aria-label={selected ? t('deselectAria') : t('selectAria')}
            className="accent-red h-5 w-5 shrink-0 cursor-pointer"
          />
        )}
        {thumb ? (
          <button
            type="button"
            onClick={() => onImageClick?.(lot)}
            className="hover:ring-red shrink-0 rounded transition-shadow hover:ring-2"
            aria-label={t('rowZoomAria', { name: lot.name })}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumb}
              alt=""
              loading="lazy"
              className="bg-surface-off h-[70px] w-[50px] rounded object-cover sm:h-[84px] sm:w-[60px]"
            />
          </button>
        ) : (
          <div className="bg-surface-off flex h-[70px] w-[50px] shrink-0 items-center justify-center rounded sm:h-[84px] sm:w-[60px]">
            <Package className="text-text-faint h-6 w-6" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-xs font-medium sm:text-sm">{lot.name}</p>
            <span className="bg-rarity-chr/20 text-rarity-chr shrink-0 rounded px-1.5 py-0.5 text-xs font-medium">
              {t('lotBadge')}
            </span>
          </div>
          <div className="text-text-muted mt-1 flex flex-wrap items-center gap-1 text-[10px] sm:gap-2 sm:text-xs">
            {lot.language && <span className="font-mono">{lot.language}</span>}
            <span>·</span>
            <span>{lot.condition}</span>
            {lot.photo_urls.length > 1 && (
              <>
                <span>·</span>
                <span>{t('photosCount', { count: lot.photo_urls.length })}</span>
              </>
            )}
            <ListingBadges
              itemKind="lot"
              itemId={lot.id}
              itemStatus={lot.status}
              listings={listings}
              myUserId={myUserId}
              partnerUserId={partnerUserId}
              partnerName={partnerName}
              onListed={onListingsChanged}
              onUnlisted={onListingsChanged}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 sm:ml-auto">
        <div className="shrink-0">
          <EditablePriceCell
            cardId={lot.id}
            initialPrice={lot.price}
            onSaved={(newPrice) => onPriceSaved(lot.id, newPrice)}
            endpoint={`/api/lots/${lot.id}`}
            priceField="price"
          />
        </div>

        <button
          type="button"
          onClick={() => onAnnonceClick(lot)}
          disabled={selectionMode}
          className="bg-surface-2 hover:bg-surface-off border-border shrink-0 rounded border px-3 py-1.5 text-xs disabled:opacity-40"
        >
          <Tag className="mr-1 inline h-3.5 w-3.5" />
          {t('annonceButton')}
        </button>

        {/* Hide the Vendu button when the lot is already sold (status='sold'
          but my listing is still up — partner sold it). The ListingBadges X
          button is the right control to retire my listing. */}
        {lot.status !== 'sold' && (
          <button
            type="button"
            onClick={() => onSoldClick(lot)}
            disabled={selectionMode}
            className="bg-red text-bg shrink-0 rounded px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-40"
          >
            {t('soldButton')}
          </button>
        )}
      </div>
    </li>
  );
}
