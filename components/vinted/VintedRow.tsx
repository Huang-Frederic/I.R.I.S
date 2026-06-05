'use client';

import { useTranslations } from 'next-intl';
import { BookmarkCheck, Bookmark, Tag } from 'lucide-react';
import type { Card, BaseListing } from '@/lib/types';
import type { CardGroup } from '@/lib/utils/group-cards';
import { VARIANT_LABEL, RARITY_COLOR } from '@/lib/utils/labels';
import { displayCardName, displaySetName } from '@/lib/utils/format-name';
import { getMyListing } from '@/lib/utils/listings';
import ListingBadges from './ListingBadges';
import StockCountChip from './StockCountChip';
import VintedPostButton from './VintedPostButton';
import VintedLogo from '@/components/ui/VintedLogo';

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
  /** When true, the current user is the designated Vinted user and the
   *  "Post to Vinted" button is shown. */
  vintedEnabled?: boolean;
}

export default function VintedRow({
  group, isRegistered, priceCell, onAnnonceClick, onSoldClick, listings, myUserId, partnerUserId, partnerName, onListingsChanged, onImageClick, onMoveToPokedexClick, onComparePokedexClick, selectionMode, selected, onToggleSelect, stockCount, onSetStockCount, stockBusy, vintedEnabled,
}: Props) {
  const t = useTranslations('vinted');
  const card = group.head;
  const mine = getMyListing(listings, myUserId);
  const isOnline = mine !== null;
  const variantLabel = card.variant ? (VARIANT_LABEL[card.variant] ?? card.variant) : null;

  return (
    <li className="bg-surface border-border flex items-stretch gap-2 rounded-lg border p-2 text-sm sm:items-center sm:gap-3 sm:p-3">
      {selectionMode && (
        <input
          type="checkbox"
          checked={!!selected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          aria-label={selected ? t('deselectAria') : t('selectAria')}
          className="accent-red h-5 w-5 shrink-0 cursor-pointer self-center"
        />
      )}
      <button
        type="button"
        onClick={() => onImageClick?.(card)}
        className="hover:ring-red shrink-0 self-stretch overflow-hidden rounded transition-shadow hover:ring-2 sm:self-auto"
        aria-label={t('rowZoomAria', { name: displayCardName(card) })}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbUrl(card)}
          alt=""
          loading="lazy"
          className="bg-surface-off h-full w-[60px] origin-[center_35%] scale-[1.8] rounded object-cover sm:h-[84px] sm:w-[60px]"
        />
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
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

        <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 sm:ml-auto">
          {group.count > 1 && (
            <span className="bg-surface-off text-text-muted shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] sm:px-2 sm:py-1 sm:text-xs">
              ×{group.count}
            </span>
          )}

          <div className="shrink-0">{priceCell}</div>

          <button
            type="button"
            onClick={onAnnonceClick}
            disabled={selectionMode}
            className="bg-surface-2 hover:bg-surface-off border-border shrink-0 rounded border px-2 py-1 text-[10px] disabled:opacity-40 sm:px-3 sm:py-1.5 sm:text-xs"
          >
            <Tag className="mr-1 inline h-3 w-3 sm:h-3.5 sm:w-3.5" />
            {t('rowAnnonceButton')}
          </button>

          {!isOnline && !selectionMode && vintedEnabled && (
            <VintedPostButton
              cardId={card.id}
              hasPrice={card.suggested_price !== null}
              onListingsChanged={onListingsChanged}
            />
          )}

          {isOnline && !selectionMode && (
            <>
              {group.head.status !== 'sold' && (
                <button
                  type="button"
                  onClick={onSoldClick}
                  disabled={selectionMode}
                  className="bg-red text-bg shrink-0 rounded px-2 py-1 text-[10px] font-medium hover:opacity-90 disabled:opacity-40 sm:px-3 sm:py-1.5 sm:text-xs"
                >
                  {t('rowSoldButton')}
                </button>
              )}
              {vintedEnabled && (
                card.vinted_listing_id ? (
                  <a
                    href={`https://www.vinted.fr/items/${card.vinted_listing_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 hover:opacity-70 transition-opacity"
                    title="Voir l'annonce sur Vinted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/vinted-logo.jpeg" alt="Vinted" className="h-6 w-6 rounded sm:h-7 sm:w-7 object-cover" />
                  </a>
                ) : (
                  <span className="shrink-0 cursor-not-allowed opacity-25" title="Pas de lien Vinted (posté manuellement)">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/vinted-logo.jpeg" alt="Vinted" className="h-6 w-6 rounded sm:h-7 sm:w-7 object-cover" />
                  </span>
                )
              )}
            </>
          )}
        </div>
      </div>
    </li>
  );
}
