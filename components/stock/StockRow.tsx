'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Tag, BookmarkCheck, Bookmark, Globe, GlobeLock, Boxes } from 'lucide-react';
import type { Card } from '@/lib/types';
import type { CardGroup } from '@/lib/utils/group-cards';
import { VARIANT_LABEL, RARITY_COLOR } from '@/lib/utils/labels';
import { displayCardName, displaySetName } from '@/lib/utils/format-name';
import CardZoomModal from '@/components/vinted/CardZoomModal';
import ConfirmDialog from '@/components/vinted/ConfirmDialog';
import { PriceWithTrend } from '@/components/ui/PriceWithTrend';

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
  /** Open the side-by-side compare modal when the pokémon's Pokédex slot is
   *  already filled. Optional — when absent the badge falls back to a passive
   *  indicator. */
  onComparePokedexClick?: (card: Card) => void;
  onOpenPriceModal?: () => void;
  /** Apply a target count for this group. Caller diffs against group.count and clones / deletes accordingly. */
  onSetCount: (group: CardGroup, target: number) => void;
  busy?: boolean;
  /** When true, show a checkbox and disable the row actions (bulk trade). */
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

export default function StockRow({
  group,
  isRegistered,
  hasForSaleSibling,
  onListForSaleClick,
  onMoveToPokedexClick,
  onComparePokedexClick,
  onOpenPriceModal,
  onSetCount,
  busy = false,
  selectionMode = false,
  selected = false,
  onToggleSelect,
}: Props) {
  const t = useTranslations('stock');
  const card = group.head;
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  // Sync the input value with the parent-reported count, but allow free typing
  // in between. We mirror group.count in `lastSyncedCount` and reset the draft
  // whenever the parent sends a new count (after a clone / delete settles).
  // This is the React 19 idiom for "derive state from props" without an effect.
  const [draftCount, setDraftCount] = useState(String(group.count));
  const [lastSyncedCount, setLastSyncedCount] = useState(group.count);
  /** Set when the user types 0 — defer the destructive call until they
   *  confirm (the Vinted-side chip skips this confirm because the for_sale
   *  row stays put; here, 0 wipes the entire physical stock). */
  const [confirmZero, setConfirmZero] = useState(false);
  if (group.count !== lastSyncedCount) {
    setLastSyncedCount(group.count);
    setDraftCount(String(group.count));
  }
  const variantLabel = card.variant ? (VARIANT_LABEL[card.variant] ?? card.variant) : null;

  const commitCount = () => {
    const parsed = parseInt(draftCount, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      // Reject negatives + non-numeric: revert.
      setDraftCount(String(group.count));
      return;
    }
    if (parsed === group.count) return; // no-op
    if (parsed === 0) {
      // Don't fire delete-all silently — confirm first.
      setConfirmZero(true);
      return;
    }
    onSetCount(group, parsed);
  };

  return (
    <li className="bg-surface border-border flex items-stretch gap-2 rounded-lg border p-2 text-sm sm:items-center sm:gap-3 sm:p-3">
      {selectionMode && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          aria-label={selected ? t('deselectAria') : t('selectAria')}
          className="accent-red h-5 w-5 shrink-0 cursor-pointer self-center"
        />
      )}
      <button
        type="button"
        onClick={() => setZoomSrc(thumbUrl(card))}
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
            {hasForSaleSibling ? (
              <span
                className="bg-rarity-r/20 text-rarity-r inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
                title={t('badgeVintedTitle')}
              >
                <Globe className="h-3 w-3" />
                <span className="hidden sm:inline">{t('badgeVinted')}</span>
              </span>
            ) : (
              <span
                className="bg-rarity-ar/20 text-rarity-ar inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
                title={t('badgeNotVintedTitle')}
              >
                <GlobeLock className="h-3 w-3" />
                <span className="hidden sm:inline">{t('badgeNotVinted')}</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 sm:ml-auto">
          {/* Cardmarket price chip — avg + trend arrow only.
              Hidden entirely when no price has been resolved yet (newly-scanned
              card pre-cron, or variant kept on manual pricing). */}
          {card.cm_price_avg != null && (
            <PriceWithTrend
              cardId={card.id}
              cmPriceAvg={card.cm_price_avg}
              cardmarketUrl={card.cardmarket_url}
              variant="chip"
              onPriceClick={onOpenPriceModal}
            />
          )}

          {/* Editable count: type a number and blur (or Enter) to apply.
              Caller diffs against the previous count to clone or delete. */}
          <label className="border-border bg-surface-2 text-text-muted flex items-center gap-1 rounded border px-1.5 py-0.5 sm:px-2 sm:py-1">
            <Boxes className="h-3 w-3" />
            <span className="font-mono text-[10px] sm:text-xs">×</span>
            <input
              type="number"
              min={0}
              value={draftCount}
              disabled={busy || selectionMode}
              onChange={(e) => setDraftCount(e.target.value)}
              onBlur={commitCount}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                } else if (e.key === 'Escape') {
                  setDraftCount(String(group.count));
                  e.currentTarget.blur();
                }
              }}
              aria-label={t('countAria')}
              className="bg-transparent text-text w-8 font-mono text-[10px] outline-none disabled:opacity-40 sm:w-10 sm:text-xs"
            />
          </label>

          <button
            type="button"
            onClick={() => onListForSaleClick(card)}
            disabled={busy || hasForSaleSibling || selectionMode}
            title={hasForSaleSibling ? t('listForSaleConflictTitle') : undefined}
            className="bg-red text-bg shrink-0 rounded px-2 py-1 text-[10px] font-medium hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:px-3 sm:py-1.5 sm:text-xs"
          >
            <Tag className="mr-1 inline h-3 w-3 sm:h-3.5 sm:w-3.5" />
            {t('listForSale')}
          </button>
        </div>
      </div>

      {zoomSrc && (
        <CardZoomModal src={zoomSrc} alt="" onClose={() => setZoomSrc(null)} />
      )}

      {confirmZero && (
        <ConfirmDialog
          title={t('wipeConfirmTitle')}
          body={t.rich('wipeConfirmBody', {
            count: group.count,
            name: card.pokemon_name ?? displayCardName(card),
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
          confirmLabel={t('wipeConfirmAction')}
          confirmTone="danger"
          busy={busy}
          onConfirm={() => {
            setConfirmZero(false);
            onSetCount(group, 0);
          }}
          onCancel={() => {
            setConfirmZero(false);
            setDraftCount(String(group.count));
          }}
        />
      )}
    </li>
  );
}
