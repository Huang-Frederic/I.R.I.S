'use client';

import { useTranslations } from 'next-intl';
import { BookmarkCheck, Bookmark, Tag } from 'lucide-react';
import type { Card, BaseListing } from '@/lib/types';
import type { CardGroup } from '@/lib/utils/group-cards';
import { VARIANT_LABEL, RARITY_COLOR } from '@/lib/utils/labels';
import { displayCardName, displaySetName } from '@/lib/utils/format-name';
import ListingBadges from './ListingBadges';
import StockCountChip from './StockCountChip';

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
  listings: BaseListing[];
  myUserId: string;
  partnerUserId: string | null;
  partnerName: string | null;
  onListingsChanged: () => void;
  onImageClick?: (card: Card) => void;
  /**
   * Called when the user clicks the "Pas Pokédex" badge — invitation to
   * promote this card to the Pokédex slot. The badge fires this only when
   * the slot is empty.
   */
  onMoveToPokedexClick?: (card: Card) => void;
  /**
   * Called when the user clicks the "Pokédex" badge of a card whose slot is
   * already filled — opens a side-by-side compare modal. */
  onComparePokedexClick?: (card: Card) => void;
  /** When true, show a checkbox on the left and disable Annonce/Vendu buttons. */
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  /** Count of physical copies in Stock (status='collection') for this group.
   *  Drives the editable StockCountChip. */
  stockCount: number;
  /** Apply a target stock count for this group's collection rows.
   *  See StockCountChip + VintedList.handleSetStockCount. */
  onSetStockCount: (target: number) => void;
  /** True while the parent is mid-clone/delete for this group's stock. */
  stockBusy?: boolean;
}

export default function VintedRow({
  group, isRegistered, priceCell, onAnnonceClick, onSoldClick, listings, myUserId, partnerUserId, partnerName, onListingsChanged, onImageClick, onMoveToPokedexClick, onComparePokedexClick, selectionMode, selected, onToggleSelect, stockCount, onSetStockCount, stockBusy,
}: Props) {
  const t = useTranslations('vinted');
  const card = group.head;
  const variantLabel = card.variant ? (VARIANT_LABEL[card.variant] ?? card.variant) : null;

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
        <button
          type="button"
          onClick={() => onImageClick?.(card)}
          className="hover:ring-red shrink-0 overflow-hidden rounded transition-shadow hover:ring-2"
          aria-label={t('rowZoomAria', { name: displayCardName(card) })}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbUrl(card)}
            alt=""
            loading="lazy"
            className="bg-surface-off h-[70px] w-[50px] origin-[center_25%] scale-[3] rounded object-cover sm:h-[84px] sm:w-[60px]"
          />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-xs font-medium sm:text-sm">{displayCardName(card)}</p>
            {variantLabel && (
              <span className="bg-surface-off text-text-muted shrink-0 rounded px-1.5 py-0.5 font-mono text-xs">
                {variantLabel}
              </span>
            )}
          </div>
          <p className="text-text-muted truncate text-xs">
            {displaySetName(card) ?? card.set_code ?? '?'}
            {card.set_code && displaySetName(card) ? ` (${card.set_code})` : ''}
            {card.set_number ? ` — ${card.set_number}` : ''}
          </p>
          <div className="text-text-muted mt-1 flex flex-wrap items-center gap-1 text-[10px] sm:gap-2 sm:text-xs">
            <span className="font-mono">{card.language}</span>
            <span>·</span>
            <span className={`font-medium ${RARITY_COLOR[card.rarity] ?? ''}`}>{card.rarity}</span>
            <span>·</span>
            <span>{card.condition}</span>
            {/* Trainers/Energies (no pokemon_number) have no Pokédex slot — hide
                the badge entirely. */}
            {card.pokemon_number != null && (
              isRegistered ? (
                <button
                  type="button"
                  onClick={() => onComparePokedexClick?.(card)}
                  disabled={!onComparePokedexClick}
                  title={t('badgePokedexTitle')}
                  className="bg-rarity-r/20 text-rarity-r hover:bg-rarity-r/30 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors disabled:cursor-default"
                >
                  <BookmarkCheck className="h-3 w-3" />
                  <span className="hidden sm:inline">{t('badgePokedex')}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onMoveToPokedexClick?.(card)}
                  disabled={!onMoveToPokedexClick}
                  title={t('badgeNotPokedexTitle')}
                  className="bg-rarity-ar/20 text-rarity-ar hover:bg-rarity-ar/30 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors disabled:cursor-default"
                >
                  <Bookmark className="h-3 w-3" />
                  <span className="hidden sm:inline">{t('badgeNotPokedex')}</span>
                </button>
              )
            )}
            <StockCountChip
              count={stockCount}
              onSetCount={onSetStockCount}
              busy={stockBusy}
            />
            <ListingBadges
              itemKind="card"
              itemId={card.id}
              itemStatus={card.status}
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
        {group.count > 1 && (
          <span className="bg-surface-off text-text-muted shrink-0 rounded px-2 py-1 font-mono text-xs">
            ×{group.count}
          </span>
        )}

        <div className="shrink-0">{priceCell}</div>

        <button
          type="button"
          onClick={onAnnonceClick}
          disabled={selectionMode}
          className="bg-surface-2 hover:bg-surface-off border-border shrink-0 rounded border px-3 py-1.5 text-xs disabled:opacity-40"
        >
          <Tag className="mr-1 inline h-3.5 w-3.5" />
          {t('rowAnnonceButton')}
        </button>

        {/* Hide the Vendu button when the card is already sold — only the
          partner could mark it sold, my row is here only because my listing
          is still up (À retirer). The ListingBadges X button handles that. */}
        {group.head.status !== 'sold' && (
          <button
            type="button"
            onClick={onSoldClick}
            disabled={selectionMode}
            className="bg-red text-bg shrink-0 rounded px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-40"
          >
            {t('rowSoldButton')}
          </button>
        )}
      </div>
    </li>
  );
}
