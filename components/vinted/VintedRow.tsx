// components/vinted/VintedRow.tsx
'use client';

import { BookmarkCheck, Bookmark, Tag } from 'lucide-react';
import type { Card } from '@/lib/types';
import type { CardGroup } from '@/lib/utils/group-cards';
import VintedListedToggle from './VintedListedToggle';
import PriceFreshnessBadge from '@/components/ui/PriceFreshnessBadge';
import RefreshPriceButton from '@/components/ui/RefreshPriceButton';

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
  priceCell: React.ReactNode;
  onAnnonceClick: () => void;
  onSoldClick: () => void;
  onListedToggled: (cardId: string, listedAt: string | null) => void;
  onImageClick?: (card: Card) => void;
  /**
   * Called when the user clicks the "Pas Pokédex" badge — invitation to
   * promote this card to the Pokédex slot. The badge is non-interactive when
   * the card is already registered.
   */
  onMoveToPokedexClick?: (card: Card) => void;
  /** Called when the manual refresh of this card's price succeeds. */
  onPriceRefreshed?: (card: Card) => void;
}

export default function VintedRow({
  group, isRegistered, priceCell, onAnnonceClick, onSoldClick, onListedToggled, onImageClick, onMoveToPokedexClick, onPriceRefreshed,
}: Props) {
  const card = group.head;
  const variantLabel = card.variant ? (VARIANT_LABEL[card.variant] ?? card.variant) : null;

  return (
    <li className="bg-surface border-border flex flex-col gap-3 rounded-lg border p-3 text-sm sm:flex-row sm:items-center">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onImageClick?.(card)}
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
            <VintedListedToggle
              cardId={card.id}
              currentListedAt={card.vinted_listed_at}
              onToggled={(listedAt) => onListedToggled(card.id, listedAt)}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 sm:ml-auto">
        {group.count > 1 && (
          <span className="bg-surface-off text-text-muted shrink-0 rounded px-2 py-1 font-mono text-xs">
            ×{group.count}
          </span>
        )}

        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-1.5">
            {priceCell}
            {onPriceRefreshed && (
              <RefreshPriceButton cardId={card.id} onRefreshed={onPriceRefreshed} />
            )}
          </div>
          <PriceFreshnessBadge cm_updated_at={card.cm_updated_at} />
        </div>

        <button
          type="button"
          onClick={onAnnonceClick}
          className="bg-surface-2 hover:bg-surface-off border-border shrink-0 rounded border px-3 py-1.5 text-xs"
        >
          <Tag className="mr-1 inline h-3.5 w-3.5" />
          Annonce
        </button>

        <button
          type="button"
          onClick={onSoldClick}
          className="bg-red text-bg shrink-0 rounded px-3 py-1.5 text-xs font-medium hover:opacity-90"
        >
          Vendu
        </button>
      </div>
    </li>
  );
}
