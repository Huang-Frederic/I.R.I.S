'use client';

import { useTranslations } from 'next-intl';
import { Package, Globe, GlobeLock, Tag } from 'lucide-react';
import type { OtherItemWithListings } from '@/lib/types';
import EditablePriceCell from '@/components/vinted/EditablePriceCell';

interface Props {
  item: OtherItemWithListings;
  storagePublicUrl: (path: string) => string;
  myUserId: string;
  onPriceSaved: (itemId: string, newPrice: number | null) => void;
  onAnnonceClick: (item: OtherItemWithListings) => void;
}

export default function OtherItemRow({ item, storagePublicUrl, myUserId, onPriceSaved, onAnnonceClick }: Props) {
  const t = useTranslations('otherItemAnnonce');
  const myListing = item.listings.find((l) => l.user_id === myUserId) ?? null;
  const isOnline = myListing?.vinted_listing_id != null;
  const thumb = item.photo_urls.length > 0 ? storagePublicUrl(item.photo_urls[0]) : null;

  return (
    <li className="bg-surface border-border [content-visibility:auto] [contain-intrinsic-size:auto_106px] flex flex-col gap-2 rounded-lg border p-2 text-sm sm:flex-row sm:items-center sm:gap-3 sm:p-3">
      <div className="flex items-center gap-3">
        {thumb ? (
          <button
            type="button"
            onClick={() => onAnnonceClick(item)}
            className="hover:ring-red shrink-0 rounded transition-shadow hover:ring-2"
            aria-label={t('rowZoomAria', { name: item.name })}
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
            <p className="truncate text-xs font-medium sm:text-sm">{item.name}</p>
            {item.brand_name && (
              <span className="bg-surface-2 text-text-muted shrink-0 rounded px-1.5 py-0.5 text-xs">
                {item.brand_name}
              </span>
            )}
          </div>
          <div className="text-text-muted mt-1 flex flex-wrap items-center gap-1 text-[10px] sm:gap-2 sm:text-xs">
            {isOnline ? (
              <span className="bg-rarity-r/20 text-rarity-r inline-flex items-center gap-1 rounded px-1.5 py-0.5">
                <Globe className="h-3 w-3" />
                <span className="hidden sm:inline">{t('online')}</span>
              </span>
            ) : (
              <span className="bg-surface-2 text-text-faint inline-flex items-center gap-1 rounded px-1.5 py-0.5">
                <GlobeLock className="h-3 w-3" />
                <span className="hidden sm:inline">{t('offline')}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 sm:ml-auto">
        <div className="shrink-0">
          <EditablePriceCell
            cardId={item.id}
            initialPrice={item.price}
            onSaved={(newPrice) => onPriceSaved(item.id, newPrice)}
            endpoint={`/api/other-items/${item.id}`}
            priceField="price"
          />
        </div>

        <button
          type="button"
          onClick={() => onAnnonceClick(item)}
          className="bg-surface-2 hover:bg-surface-off border-border shrink-0 rounded border px-3 py-1.5 text-xs"
        >
          <Tag className="mr-1 inline h-3.5 w-3.5" />
          {t('annonceButton')}
        </button>
      </div>
    </li>
  );
}
