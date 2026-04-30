'use client';

import { useState } from 'react';
import { PackageCheck, PackageOpen, Tag } from 'lucide-react';
import type { Card } from '@/lib/types';
import CardZoomModal from '@/components/vinted/CardZoomModal';

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

interface Props {
  card: Card;
  hasForSaleSibling: boolean;
  onListForSaleClick: (card: Card) => void;
  busy?: boolean;
}

export default function StockRow({ card, hasForSaleSibling, onListForSaleClick, busy = false }: Props) {
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const variantLabel = card.variant ? (VARIANT_LABEL[card.variant] ?? card.variant) : null;

  return (
    <li className="bg-surface border-border flex flex-col gap-3 rounded-lg border p-3 text-sm sm:flex-row sm:items-center">
      <div className="flex items-center gap-3">
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
              <span className="bg-surface-off text-text-muted shrink-0 rounded px-1.5 py-0.5 font-mono text-xs">
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
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${
            hasForSaleSibling
              ? 'bg-rarity-r/20 text-rarity-r'
              : 'bg-rarity-ar/20 text-rarity-ar'
          }`}
          title={hasForSaleSibling ? 'Un exemplaire est déjà en vente' : 'Aucun exemplaire en vente'}
        >
          {hasForSaleSibling ? <PackageCheck className="h-3 w-3" /> : <PackageOpen className="h-3 w-3" />}
          {hasForSaleSibling ? 'En vente' : 'Pas en vente'}
        </span>

        <button
          type="button"
          onClick={() => onListForSaleClick(card)}
          disabled={busy || hasForSaleSibling}
          title={hasForSaleSibling ? 'Un exemplaire est déjà en vente — impossible d\'en lister deux' : undefined}
          className="bg-red text-bg shrink-0 rounded px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Tag className="mr-1 inline h-3.5 w-3.5" />
          Mettre en vente
        </button>
      </div>

      {zoomSrc && (
        <CardZoomModal src={zoomSrc} alt="" onClose={() => setZoomSrc(null)} />
      )}
    </li>
  );
}
