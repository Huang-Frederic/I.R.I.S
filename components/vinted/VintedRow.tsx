// components/vinted/VintedRow.tsx
'use client';

import { BookmarkCheck, Bookmark, Tag } from 'lucide-react';
import type { Card } from '@/lib/types';
import type { CardGroup } from '@/lib/utils/group-cards';
import VintedListedToggle from './VintedListedToggle';

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
}

export default function VintedRow({
  group, isRegistered, priceCell, onAnnonceClick, onSoldClick, onListedToggled,
}: Props) {
  const card = group.head;
  const variantLabel = card.variant ? (VARIANT_LABEL[card.variant] ?? card.variant) : null;

  return (
    <li className="bg-surface border-border flex items-center gap-3 rounded-lg border p-3 text-sm">
      <span className="text-text-faint w-8 shrink-0 font-mono text-xs">#{group.position}</span>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbUrl(card)}
        alt=""
        loading="lazy"
        className="bg-surface-off h-[84px] w-[60px] shrink-0 rounded object-cover"
      />

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
          <span
            className={`ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${
              isRegistered
                ? 'bg-rarity-r/20 text-rarity-r'
                : 'bg-rarity-ar/20 text-rarity-ar'
            }`}
            title={
              isRegistered
                ? 'Cette carte est dans ton Pokédex'
                : 'Pas dans ton Pokédex'
            }
          >
            {isRegistered ? <BookmarkCheck className="h-3 w-3" /> : <Bookmark className="h-3 w-3" />}
            {isRegistered ? 'Pokédex' : 'Pas Pokédex'}
          </span>
        </div>
      </div>

      {group.count > 1 && (
        <span className="bg-surface-off text-text-muted shrink-0 rounded px-2 py-1 font-mono text-xs">
          ×{group.count}
        </span>
      )}

      <VintedListedToggle
        cardId={card.id}
        initialListed={card.vinted_listed_at !== null}
        onToggled={(listedAt) => onListedToggled(card.id, listedAt)}
      />

      <div className="shrink-0">{priceCell}</div>

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
    </li>
  );
}
