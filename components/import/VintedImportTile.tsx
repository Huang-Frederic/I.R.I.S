'use client';

import Image from 'next/image';
import type { EnrichedCard } from '@/lib/types';
import type { ParsedListing, VintedItem } from '@/lib/types/vinted-import';

export interface VintedImportTileProps {
  item: VintedItem;
  parsed: ParsedListing | null;
  enriched: EnrichedCard | null;
  selected: boolean;
  onToggle: () => void;
  onZoom: () => void;
  onEdit: () => void;
}

function daysSince(ts: number): number {
  const ms = Date.now() - ts * 1000;
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function statusBorderClass(parsed: ParsedListing | null, enriched: EnrichedCard | null): string {
  if (!parsed) return 'border-rarity-ar/50';
  if (!enriched) return 'border-rarity-r/40';
  return 'border-rarity-uc/30';
}

export function VintedImportTile({
  item,
  parsed,
  enriched,
  selected,
  onToggle,
  onZoom,
  onEdit,
}: VintedImportTileProps) {
  const photo = item.photos[0]?.url ?? null;
  const days = daysSince(item.created_at_ts);
  const displayName =
    enriched?.pokemon_name ?? (item.title.length > 30 ? `${item.title.slice(0, 30)}…` : item.title);

  return (
    <div
      className={`relative rounded-lg border-2 p-3 transition-opacity ${statusBorderClass(parsed, enriched)} ${selected ? '' : 'opacity-40'}`}
    >
      <label className="absolute left-2 top-2 z-10 flex items-center">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="h-4 w-4 accent-rarity-uc"
          aria-label="Importer cette carte"
        />
      </label>
      <button
        type="button"
        onClick={onZoom}
        className="block w-full overflow-hidden rounded bg-surface-off"
        aria-label="Zoom photo"
      >
        {photo ? (
          <Image
            src={photo}
            alt={displayName}
            width={200}
            height={280}
            className="h-auto w-full object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-40 items-center justify-center text-xs text-text-faint">
            Pas de photo
          </div>
        )}
      </button>
      <div className="mt-2 space-y-1 text-xs">
        <div className="font-semibold">{displayName}</div>
        {parsed ? (
          <div className="text-text-muted">
            {parsed.setCode}-{parsed.setNumber} · {parsed.condition} · {parsed.language}
          </div>
        ) : (
          <div className="text-rarity-ar">Pattern non détecté</div>
        )}
        <div className="text-text-muted">
          €{Number(item.price.amount).toFixed(2)} · en ligne {days}j
        </div>
        {!parsed && (
          <button
            type="button"
            onClick={onEdit}
            className="mt-1 rounded bg-rarity-ar/20 px-2 py-1 text-rarity-ar"
          >
            Compléter manuellement
          </button>
        )}
      </div>
    </div>
  );
}
