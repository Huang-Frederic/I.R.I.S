'use client';

import { useTranslations } from 'next-intl';
import { Package } from 'lucide-react';
import type { Lot } from '@/lib/types';
import { useUserContext } from '@/lib/hooks/useUserContext';
import { badgeClassesForColor, colorForUserName } from '@/lib/utils/user-colors';

interface Props {
  lot: Lot;
  storagePublicUrl: (path: string) => string;
  /** Click on the image opens the AnnonceModal (read-only preview of the
   * canonical Vinted listing text + photo carousel). Same handler as the
   * old "Annonce" button — kept centralized in VintedList. */
  onImageClick: (lot: Lot) => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Sold view of a lot. Mirrors SoldRow for cards: muted background, no action
 * buttons, image click opens the LotAnnonceModal as a read-only preview.
 *
 * Matters because the for-sale LotRow (with Mettre en ligne / Annonce / Vendu /
 * X buttons) is a poor fit for sold lots — those actions don't apply once the
 * lot has shipped, and the row should look retired. The 'Moi/Lui/Elle' badge
 * surfaces who marked it sold (`sold_by_user_id`).
 */
export default function LotSoldRow({ lot, storagePublicUrl, onImageClick }: Props) {
  const t = useTranslations('lots');
  const tVinted = useTranslations('vinted');
  const { myUserId, partnerName } = useUserContext();
  const soldBySelf = lot.sold_by_user_id === myUserId;
  // 'Moi' for self with default green, partner's name with identity color.
  const sellerLabel = soldBySelf ? tVinted('sellerSelf') : (lot.sold_by_user_id ? partnerName : null);
  const sellerColor = soldBySelf ? 'neutral' : colorForUserName(partnerName);

  const thumb = lot.photo_urls.length > 0 ? storagePublicUrl(lot.photo_urls[0]) : null;

  return (
    <li className="bg-surface-off border-border flex items-center gap-3 rounded-lg border p-3 text-sm opacity-90">
      {thumb ? (
        <button
          type="button"
          onClick={() => onImageClick(lot)}
          className="hover:ring-red shrink-0 rounded transition-shadow hover:ring-2"
          aria-label={t('rowAnnonceAria', { name: lot.name })}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumb}
            alt=""
            loading="lazy"
            className="bg-surface-off h-[84px] w-[60px] rounded object-cover"
          />
        </button>
      ) : (
        <div className="bg-surface-off flex h-[84px] w-[60px] shrink-0 items-center justify-center rounded">
          <Package className="text-text-faint h-6 w-6" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{lot.name}</p>
          <span className="bg-rarity-chr/20 text-rarity-chr shrink-0 rounded px-1.5 py-0.5 text-xs font-medium">
            {t('lotBadge')}
          </span>
        </div>
        <div className="text-text-muted mt-1 flex flex-wrap items-center gap-2 text-xs">
          {lot.language && <span className="font-mono">{lot.language}</span>}
          {lot.language && <span>·</span>}
          <span>{lot.condition}</span>
          {lot.photo_urls.length > 1 && (
            <>
              <span>·</span>
              <span>{t('photosCount', { count: lot.photo_urls.length })}</span>
            </>
          )}
          <span>·</span>
          <span className="text-text-faint" suppressHydrationWarning>{t('soldDate', { date: formatDate(lot.date_sold) })}</span>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        {sellerLabel && (
          <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${badgeClassesForColor(sellerColor)}`} title={t('soldByTitle', { name: sellerLabel })}>
            {sellerLabel}
          </span>
        )}
        <span className="text-rarity-sr font-mono text-sm font-bold">
          {lot.sold_price !== null ? `${lot.sold_price.toFixed(2)} €` : '—'}
        </span>
      </div>

    </li>
  );
}
