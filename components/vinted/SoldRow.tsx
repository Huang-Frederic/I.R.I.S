'use client';

import type { Card } from '@/lib/types';
import { useUserContext } from '@/lib/hooks/useUserContext';
import { badgeClassesForColor, colorForUserName } from '@/lib/utils/user-colors';
import { VARIANT_LABEL, RARITY_COLOR } from '@/lib/utils/labels';

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
  /** Click on the image opens the AnnonceModal (read-only listing preview).
   * Same handler as the for-sale row, kept centralized in VintedList. */
  onAnnonceClick: (card: Card) => void;
}

export default function SoldRow({ card, onAnnonceClick }: Props) {
  const { myUserId, partnerName } = useUserContext();
  const soldBySelf = card.sold_by_user_id === myUserId;
  // From my POV the seller label is always 'Moi' or the partner's name.
  // Color: default for self, identity color for the partner.
  const sellerLabel = soldBySelf ? 'Moi' : (card.sold_by_user_id ? partnerName : null);
  const sellerColor = soldBySelf ? 'neutral' : colorForUserName(partnerName);
  const variantLabel = card.variant ? (VARIANT_LABEL[card.variant] ?? card.variant) : null;
  return (
    <li className="bg-surface-off border-border flex items-center gap-3 rounded-lg border p-3 text-sm opacity-90">
      <button
        type="button"
        onClick={() => onAnnonceClick(card)}
        className="hover:ring-red shrink-0 rounded transition-shadow hover:ring-2"
        aria-label={`Voir l'annonce ${card.card_name}`}
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
          <span className="text-text-faint" suppressHydrationWarning>vendu {formatDate(card.date_sold)}</span>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        {sellerLabel && (
          <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${badgeClassesForColor(sellerColor)}`} title={`Vendu par ${sellerLabel}`}>
            {sellerLabel}
          </span>
        )}
        <span className="text-rarity-sr font-mono text-sm font-bold">
          {card.sold_price !== null ? `${card.sold_price.toFixed(2)} €` : '—'}
        </span>
      </div>
    </li>
  );
}
