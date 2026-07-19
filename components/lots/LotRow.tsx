'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Tag, Package } from 'lucide-react';
import type { Lot, LotListing } from '@/lib/types';
import EditablePriceCell from '@/components/vinted/EditablePriceCell';
import ListingBadges from '@/components/vinted/ListingBadges';
import VintedPostButton from '@/components/vinted/VintedPostButton'
import VintedActionModal from '@/components/vinted/VintedActionModal';

interface Props {
  lot: Lot;
  storagePublicUrl: (path: string) => string;
  onAnnonceClick: (lot: Lot) => void;
  onSoldClick: (lot: Lot) => void;
  onPriceSaved: (lotId: string, newPrice: number | null) => void;
  listings: LotListing[];
  myUserId: string;
  partnerUserId: string | null;
  partnerName: string | null;
  onListingsChanged: () => void;
  onBumpQueued: (itemId: string, jobId: string) => void;
  isBumping?: boolean;
  onImageClick?: (lot: Lot) => void;
  /** When true, show a checkbox on the left and disable Annonce/Vendu buttons. */
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  vintedEnabled?: boolean;
}

export default function LotRow({
  lot, storagePublicUrl, onAnnonceClick, onSoldClick, onPriceSaved, listings, myUserId, partnerUserId, partnerName, onListingsChanged, onBumpQueued, isBumping, onImageClick, selectionMode, selected, onToggleSelect, vintedEnabled,
}: Props) {
  const t = useTranslations('lots');
  const myListing = listings.find((l) => l.user_id === myUserId) ?? null;
  const isOnline = myListing?.vinted_listing_id != null;
  const [actionModalOpen, setActionModalOpen] = useState(false);
  // Snapshot "now" once at mount — a staleness badge doesn't need to tick live,
  // and reading the clock during render violates the purity rule.
  const [now] = useState(() => Date.now());
  const isStale = myListing?.vinted_posted_at ? now - new Date(myListing.vinted_posted_at).getTime() > 21 * 24 * 60 * 60 * 1000 : false;
  const thumb = lot.photo_urls.length > 0 ? storagePublicUrl(lot.photo_urls[0]) : null;

  return (
    <li className="bg-surface border-border [content-visibility:auto] [contain-intrinsic-size:auto_106px] flex flex-col gap-2 rounded-lg border p-2 text-sm sm:flex-row sm:items-center sm:gap-3 sm:p-3">
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
            <LotTypeBadge catalogId={lot.catalog_id} />
            <LotBrandBadge brandId={lot.brand_id} />
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
              isBumping={isBumping}
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

        {vintedEnabled && !isOnline && !selectionMode && (
          <VintedPostButton
            lotId={lot.id}
            userId={myUserId}
            hasPrice={lot.price !== null}
            onListingsChanged={onListingsChanged}
          />
        )}

        {vintedEnabled && isOnline && !selectionMode && myListing?.vinted_listing_id && (
          myListing.vinted_posted_at ? (
            // Posted via IRIS — active: stale badge + clickable logo opens modal
            <>
              {isStale && (
                <button
                  type="button"
                  onClick={() => setActionModalOpen(true)}
                  className="bg-rarity-ar/20 text-rarity-ar shrink-0 rounded px-1.5 py-0.5 text-[10px] sm:text-xs"
                  title="Annonce stale — cliquer pour bumper"
                >
                  ⏰ Stale
                </button>
              )}
              <button
                type="button"
                onClick={() => setActionModalOpen(true)}
                className="shrink-0 hover:opacity-70 transition-opacity"
                title="Voir ou bumper l'annonce Vinted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/vinted-logo.jpeg"
                  alt="Vinted"
                  className={`h-6 w-6 rounded sm:h-7 sm:w-7 object-cover ${isStale ? 'ring-2 ring-rarity-ar' : ''}`}
                />
              </button>
            </>
          ) : (
            // Posted externally (no vinted_posted_at) — greyed logo, no modal
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/vinted-logo.jpeg"
              alt="Vinted"
              className="h-6 w-6 rounded sm:h-7 sm:w-7 object-cover opacity-40 grayscale"
              title="Annonce Vinted (gérée en dehors d'IRIS)"
            />
          )
        )}
      </div>

      {actionModalOpen && myListing?.vinted_listing_id && createPortal(
        <VintedActionModal
          listingId={myListing.vinted_listing_id}
          lotId={lot.id}
          name={lot.name ?? 'Lot'}
          postedAt={myListing.vinted_posted_at}
          price={lot.price ?? null}
          userId={myUserId}
          onBumpQueued={onBumpQueued}
          onClose={() => setActionModalOpen(false)}
        />,
        document.body
      )}
    </li>
  );
}

const CATALOG_SINGLE = 4875;

function LotTypeBadge({ catalogId }: { catalogId: number | null }) {
  const isSingle = catalogId === CATALOG_SINGLE;
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${
      isSingle
        ? 'bg-blue-500/15 text-blue-400'
        : 'bg-rarity-chr/20 text-rarity-chr'
    }`}>
      {isSingle ? 'Single' : 'Lot'}
    </span>
  );
}

const BRAND_LABELS: Record<number, string> = {
  191646: 'Pokémon',
  89766: 'One Piece',
  399547: 'Magic',
  287189: 'Lorcana',
  312702: 'Yu-Gi-Oh!',
  284189: 'Digimon',
  350491: 'Dragon Ball',
  12800798: 'Wankul',
  509120: 'Riftbound',
};

function LotBrandBadge({ brandId }: { brandId: number | null }) {
  const label = brandId == null ? 'Pokémon' : (BRAND_LABELS[brandId] ?? 'Autres');
  return (
    <span className="bg-surface-2 text-text-muted shrink-0 rounded px-1.5 py-0.5 text-xs">
      {label}
    </span>
  );
}
