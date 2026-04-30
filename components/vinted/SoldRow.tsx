'use client';

import type { Card } from '@/lib/types';

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

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface Props {
  card: Card;
}

export default function SoldRow({ card }: Props) {
  const variantLabel = card.variant ? (VARIANT_LABEL[card.variant] ?? card.variant) : null;
  return (
    <li className="bg-surface-off border-border flex items-center gap-3 rounded-lg border p-3 text-sm opacity-90">
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
            <span className="bg-surface text-text-muted shrink-0 rounded px-1.5 py-0.5 font-mono text-xs">
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
          <span>·</span>
          <span className="text-text-faint">vendu {formatDate(card.date_sold)}</span>
        </div>
      </div>

      <span className="text-rarity-sr shrink-0 font-mono text-sm font-bold">
        {card.sold_price !== null ? `${card.sold_price.toFixed(2)} €` : '—'}
      </span>
    </li>
  );
}
