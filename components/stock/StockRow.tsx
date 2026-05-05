'use client';

import { useState } from 'react';
import { Tag, BookmarkCheck, Bookmark, Globe, GlobeLock } from 'lucide-react';
import type { Card } from '@/lib/types';
import type { CardGroup } from '@/lib/utils/group-cards';
import CardZoomModal from '@/components/vinted/CardZoomModal';

const VARIANT_LABEL: Record<string, string> = {
  pokeball: 'Poké Ball',
  masterball: 'Master Ball',
  reverse_holo: 'Reverse Holo',
  stamp: 'Stamp',
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
  const card = group.head;
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  // Sync the input value with the parent-reported count, but allow free typing
  // in between. We mirror group.count in `lastSyncedCount` and reset the draft
  // whenever the parent sends a new count (after a clone / delete settles).
  // This is the React 19 idiom for "derive state from props" without an effect.
  const [draftCount, setDraftCount] = useState(String(group.count));
  const [lastSyncedCount, setLastSyncedCount] = useState(group.count);
  if (group.count !== lastSyncedCount) {
    setLastSyncedCount(group.count);
    setDraftCount(String(group.count));
  }
  const variantLabel = card.variant ? (VARIANT_LABEL[card.variant] ?? card.variant) : null;

  const commitCount = () => {
    const parsed = parseInt(draftCount, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      // Reject: revert the field to the current group count.
      setDraftCount(String(group.count));
      return;
    }
    if (parsed === group.count) return; // no-op
    onSetCount(group, parsed);
  };

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
            {hasForSaleSibling ? (
              <span
                className="bg-rarity-r/20 text-rarity-r inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
                title="Un exemplaire de cette carte est déjà en vente sur Vinted"
              >
                <Globe className="h-3 w-3" />
                Vinted
              </span>
            ) : (
              <span
                className="bg-rarity-ar/20 text-rarity-ar inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
                title="Cette carte n'est pas en vente — utilise le bouton « Mettre en vente »"
              >
                <GlobeLock className="h-3 w-3" />
                Pas Vinted
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 sm:ml-auto">
        {/* Editable count: type a number and blur (or Enter) to apply.
            Caller diffs against the previous count to clone or delete. */}
        <label className="border-border bg-surface-2 flex items-center gap-1 rounded border px-2 py-1">
          <span className="text-text-muted font-mono text-xs">×</span>
          <input
            type="number"
            min={1}
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
            aria-label="Nombre d'exemplaires"
            className="bg-transparent text-text w-10 font-mono text-xs outline-none disabled:opacity-40"
          />
        </label>

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
