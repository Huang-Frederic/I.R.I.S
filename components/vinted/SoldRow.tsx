'use client';

import { useState } from 'react';
import type { Card } from '@/lib/types';
import CardZoomModal from '@/components/vinted/CardZoomModal';
import { useUserContext } from '@/lib/hooks/useUserContext';
import { badgeClassesForColor, colorForUserName } from '@/lib/utils/user-colors';

const VARIANT_LABEL: Record<string, string> = {
  pokeball: 'Poké Ball',
  masterball: 'Master Ball',
  reverse_holo: 'Reverse Holo',
  promo: 'Promo',
};

const RARITY_COLOR: Record<string, string> = {
  SAR: 'text-rarity-sar',
  AR: 'text-rarity-ar',
  SR: 'text-rarity-sr',
  CHR: 'text-rarity-chr',
  RR: 'text-rarity-rr',
  R_HOLO: 'text-rarity-r-holo',
  R: 'text-rarity-r',
  UC: 'text-rarity-uc',
  C: 'text-rarity-c',
  OTHER: 'text-text-muted',
};

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
}

export default function SoldRow({ card }: Props) {
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const { myUserId, myName, partnerName } = useUserContext();
  const soldBySelf = card.sold_by_user_id === myUserId;
  const sellerName = soldBySelf ? myName : (card.sold_by_user_id ? partnerName : null);
  const sellerColor = colorForUserName(sellerName);
  const variantLabel = card.variant ? (VARIANT_LABEL[card.variant] ?? card.variant) : null;
  return (
    <li className="bg-surface-off border-border flex items-center gap-3 rounded-lg border p-3 text-sm opacity-90">
      <button
        type="button"
        onClick={() => setZoomSrc(thumbUrl(card))}
        className="hover:ring-red shrink-0 rounded transition-shadow hover:ring-2"
        aria-label={`Voir ${card.card_name} en grand`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbUrl(card)}
          alt=""
          loading="lazy"
          className="bg-surface-off h-[84px] w-[60px] rounded object-cover"
        />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{card.card_name}</p>
          {variantLabel && (
            <span className="bg-surface text-text-muted shrink-0 rounded px-1.5 py-0.5 font-mono text-xs">
              {variantLabel}
            </span>
          )}
        </div>
        <p className="text-text-muted truncate text-xs">
          {card.set_name ?? card.set_code ?? '?'}
          {card.set_code && card.set_name ? ` (${card.set_code})` : ''}
          {card.set_number ? ` — ${card.set_number}` : ''}
        </p>
        <div className="text-text-muted mt-1 flex items-center gap-2 text-xs">
          <span className="font-mono">{card.language}</span>
          <span>·</span>
          <span className={`font-medium ${RARITY_COLOR[card.rarity] ?? ''}`}>{card.rarity}</span>
          <span>·</span>
          <span>{card.condition}</span>
          <span>·</span>
          <span className="text-text-faint">vendu {formatDate(card.date_sold)}</span>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        {sellerName && (
          <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${badgeClassesForColor(sellerColor)}`} title={`Vendu par ${sellerName}`}>
            {sellerName}
          </span>
        )}
        <span className="text-rarity-sr font-mono text-sm font-bold">
          {card.sold_price !== null ? `${card.sold_price.toFixed(2)} €` : '—'}
        </span>
      </div>

      {zoomSrc && (
        <CardZoomModal src={zoomSrc} alt="" onClose={() => setZoomSrc(null)} />
      )}
    </li>
  );
}
