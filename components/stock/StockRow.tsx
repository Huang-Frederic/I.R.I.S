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
import PriceFreshnessBadge from '@/components/ui/PriceFreshnessBadge';
import { formatEur } from '@/lib/utils/format-currency';

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
  /** Apply a target count for this group. Caller diffs against group.count and clones / deletes accordingly. */
  onSetCount: (group: CardGroup, target: number) => void;
  busy?: boolean;
}

export default function StockRow({
  group,
  isRegistered,
  hasForSaleSibling,
  onListForSaleClick,
  onMoveToPokedexClick,
  onSetCount,
  busy = false,
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
    <li className="bg-surface border-border flex flex-col gap-3 rounded-lg border p-3 text-sm sm:flex-row sm:items-center">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setZoomSrc(thumbUrl(card))}
          className="hover:ring-red shrink-0 rounded transition-shadow hover:ring-2"
          aria-label={t('rowZoomAria', { name: displayCardName(card) })}
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
            <p className="truncate font-medium">{displayCardName(card)}</p>
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
          <div className="text-text-muted mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono">{card.language}</span>
            <span>·</span>
            <span className={`font-medium ${RARITY_COLOR[card.rarity] ?? ''}`}>{card.rarity}</span>
            <span>·</span>
            <span>{card.condition}</span>
            {/* Trainers/Energies (no pokemon_number) have no Pokédex slot — hide
                the badge entirely. */}
            {card.pokemon_number != null && (
              isRegistered ? (
                <span
                  className="bg-rarity-r/20 text-rarity-r inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
                  title={t('badgePokedexTitle')}
                >
                  <BookmarkCheck className="h-3 w-3" />
                  {t('badgePokedex')}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onMoveToPokedexClick?.(card)}
                  disabled={!onMoveToPokedexClick}
                  title={t('badgeNotPokedexTitle')}
                  className="bg-rarity-ar/20 text-rarity-ar hover:bg-rarity-ar/30 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors disabled:cursor-default"
                >
                  <Bookmark className="h-3 w-3" />
                  {t('badgeNotPokedex')}
                </button>
              )
            )}
            {hasForSaleSibling ? (
              <span
                className="bg-rarity-r/20 text-rarity-r inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
                title={t('badgeVintedTitle')}
              >
                <Globe className="h-3 w-3" />
                {t('badgeVinted')}
              </span>
            ) : (
              <span
                className="bg-rarity-ar/20 text-rarity-ar inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
                title={t('badgeNotVintedTitle')}
              >
                <GlobeLock className="h-3 w-3" />
                {t('badgeNotVinted')}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 sm:ml-auto">
        {/* Cardmarket price chip — avg + freshness badge, clickable to the
            matched product page when we have one (so the user can verify the
            lookup picked the right print). Hidden entirely when no price has
            been resolved yet (newly-scanned card pre-cron, or variant kept
            on manual pricing). */}
        {card.cm_price_avg != null && (
          card.cardmarket_url ? (
            <a
              href={card.cardmarket_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="border-border bg-surface-2 hover:border-red inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors"
              title={t('cardmarketLinkTitle')}
            >
              <span className="text-text font-mono">{formatEur(card.cm_price_avg)}</span>
              <PriceFreshnessBadge cm_updated_at={card.cm_updated_at} />
            </a>
          ) : (
            <div
              className="border-border bg-surface-2 inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs"
              title={t('cardmarketNoLinkTitle')}
            >
              <span className="text-text font-mono">{formatEur(card.cm_price_avg)}</span>
              <PriceFreshnessBadge cm_updated_at={card.cm_updated_at} />
            </div>
          )
        )}

        {/* Editable count: type a number and blur (or Enter) to apply.
            Caller diffs against the previous count to clone or delete. */}
        <label className="border-border bg-surface-2 text-text-muted flex items-center gap-1 rounded border px-2 py-1">
          <Boxes className="h-3 w-3" />
          <span className="font-mono text-xs">×</span>
          <input
            type="number"
            min={0}
            value={draftCount}
            disabled={busy}
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
            className="bg-transparent text-text w-10 font-mono text-xs outline-none disabled:opacity-40"
          />
        </label>

        <button
          type="button"
          onClick={() => onListForSaleClick(card)}
          disabled={busy || hasForSaleSibling}
          title={hasForSaleSibling ? t('listForSaleConflictTitle') : undefined}
          className="bg-red text-bg shrink-0 rounded px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Tag className="mr-1 inline h-3.5 w-3.5" />
          {t('listForSale')}
        </button>
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
