'use client';

import { useState } from 'react';
import { Tag, BookmarkCheck, Bookmark, Plus, Minus } from 'lucide-react';
import type { Card } from '@/lib/types';
import type { CardGroup } from '@/lib/utils/group-cards';
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
  group: CardGroup;
  isRegistered: boolean;
  hasForSaleSibling: boolean;
  onListForSaleClick: (card: Card) => void;
  onMoveToPokedexClick?: (card: Card) => void;
  onIncrement: (card: Card) => void;
  onDecrement: (card: Card) => void;
  busy?: boolean;
}

export default function StockRow({
  group,
  isRegistered,
  hasForSaleSibling,
  onListForSaleClick,
  onMoveToPokedexClick,
  onIncrement,
  onDecrement,
  busy = false,
}: Props) {
  const card = group.head;
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
          <div className="text-text-muted mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono">{card.language}</span>
            <span>·</span>
            <span className={`font-medium ${RARITY_COLOR[card.rarity] ?? ''}`}>{card.rarity}</span>
            <span>·</span>
            <span>{card.condition}</span>
            {isRegistered ? (
              <span
                className="bg-rarity-r/20 text-rarity-r inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
                title="Cette carte est dans ton Pokédex"
              >
                <BookmarkCheck className="h-3 w-3" />
                Pokédex
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onMoveToPokedexClick?.(card)}
                disabled={!onMoveToPokedexClick}
                title="Ajouter cette carte au Pokédex"
                className="bg-rarity-ar/20 text-rarity-ar hover:bg-rarity-ar/30 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors disabled:cursor-default"
              >
                <Bookmark className="h-3 w-3" />
                Pas Pokédex
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 sm:ml-auto">
        {/* Copy counter with +/- — always visible so the user can grow a group from 1. */}
        <div className="border-border flex items-center overflow-hidden rounded border">
          <button
            type="button"
            onClick={() => onDecrement(card)}
            disabled={busy || group.count <= 1}
            aria-label="Retirer un exemplaire"
            title={group.count <= 1 ? 'Au moins 1 exemplaire requis' : 'Retirer un exemplaire'}
            className="bg-surface-2 hover:bg-surface-off text-text-muted h-7 w-7 shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Minus className="mx-auto h-3.5 w-3.5" />
          </button>
          <span className="bg-surface-off text-text shrink-0 px-2 py-0.5 font-mono text-xs">
            ×{group.count}
          </span>
          <button
            type="button"
            onClick={() => onIncrement(card)}
            disabled={busy}
            aria-label="Ajouter un exemplaire"
            title="Ajouter un exemplaire"
            className="bg-surface-2 hover:bg-surface-off text-text-muted h-7 w-7 shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="mx-auto h-3.5 w-3.5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => onListForSaleClick(card)}
          disabled={busy || hasForSaleSibling}
          title={hasForSaleSibling ? "Un exemplaire est déjà en vente — impossible d'en lister deux" : undefined}
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
