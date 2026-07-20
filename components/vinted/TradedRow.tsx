'use client';

import { useTranslations } from 'next-intl';
import { ArrowLeftRight, Camera } from 'lucide-react';
import type { Card } from '@/lib/types';
import { useUserContext } from '@/lib/hooks/useUserContext';
import { badgeClassesForColor, colorForUserName } from '@/lib/utils/user-colors';
import { VARIANT_LABEL, RARITY_COLOR } from '@/lib/utils/labels';
import { displayCardName, displaySetName } from '@/lib/utils/format-name';

function thumbUrl(card: Card): string {
  if (card.image_url) return card.image_url;
  if (card.tcg_image_url) return card.tcg_image_url;
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${card.pokemon_number}.png`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface Props {
  card: Card;
  /** Click on the thumbnail zooms the card image. */
  onImageClick: (card: Card) => void;
  /** Click on the camera chip opens the trade photo (only when one exists). */
  onTradePhotoClick: (url: string) => void;
}

/** Traded pile row — SoldRow layout with the trade badge instead of a price. */
export default function TradedRow({ card, onImageClick, onTradePhotoClick }: Props) {
  const t = useTranslations('vinted');
  const { myUserId, partnerName } = useUserContext();
  const tradedBySelf = card.traded_by_user_id === myUserId;
  const traderLabel = tradedBySelf ? t('sellerSelf') : (card.traded_by_user_id ? partnerName : null);
  const traderColor = tradedBySelf ? 'neutral' : colorForUserName(partnerName);
  const variantLabel = card.variant ? (VARIANT_LABEL[card.variant] ?? card.variant) : null;
  return (
    <li className="bg-surface-off border-border [content-visibility:auto] [contain-intrinsic-size:auto_90px] flex items-center gap-2 rounded-lg border p-2 text-sm opacity-90 sm:gap-3 sm:p-3">
      <button
        type="button"
        onClick={() => onImageClick(card)}
        className="hover:ring-red shrink-0 overflow-hidden rounded transition-shadow hover:ring-2"
        aria-label={t('tradedRowZoomAria', { name: displayCardName(card) })}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbUrl(card)}
          alt=""
          loading="lazy"
          className="bg-surface-off h-[70px] w-[50px] rounded object-cover object-[center_25%] sm:h-[84px] sm:w-[60px]"
        />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-xs font-medium sm:text-sm">{displayCardName(card)}</p>
          {variantLabel && (
            <span className="bg-surface text-text-muted shrink-0 rounded px-1.5 py-0.5 font-mono text-xs">
              {variantLabel}
            </span>
          )}
        </div>
        <p className="text-text-muted truncate text-xs">
          {displaySetName(card) ?? card.set_code ?? '?'}
          {card.set_code && displaySetName(card) ? ` (${card.set_code})` : ''}
          {card.set_number ? ` — ${card.set_number}` : ''}
        </p>
        <div className="text-text-muted mt-1 flex items-center gap-1 text-[10px] sm:gap-2 sm:text-xs">
          <span className="font-mono">{card.language}</span>
          <span>·</span>
          <span className={`font-medium ${RARITY_COLOR[card.rarity] ?? ''}`}>{card.rarity}</span>
          <span>·</span>
          <span>{card.condition}</span>
          <span>·</span>
          <span className="text-text-faint" suppressHydrationWarning>{t('tradedRowDate', { date: formatDate(card.traded_at) })}</span>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        {traderLabel && (
          <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${badgeClassesForColor(traderColor)}`} title={t('tradedRowTradedByTitle', { name: traderLabel })}>
            {traderLabel}
          </span>
        )}
        <span className="bg-rarity-chr/20 text-rarity-chr inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium sm:text-xs">
          <ArrowLeftRight className="h-3 w-3" />
          {t('tradedRowBadge')}
        </span>
        {card.trade_photo_url && (
          <button
            type="button"
            onClick={() => onTradePhotoClick(card.trade_photo_url!)}
            className="text-text-muted hover:text-text inline-flex items-center gap-1 text-[10px] underline sm:text-xs"
          >
            <Camera className="h-3 w-3" />
            {t('tradedRowPhotoLink')}
          </button>
        )}
      </div>
    </li>
  );
}
