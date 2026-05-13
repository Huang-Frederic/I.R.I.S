'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface PokedexCompareModalCard {
  card_name: string;
  image_url: string | null;
  tcg_image_url: string | null;
  pokemon_number: number | null;
}

interface Props {
  /** The card the user clicked on (Stock or Vinted row). */
  currentCard: PokedexCompareModalCard;
  /** The card already filling the Pokédex slot for the same pokemon_number. */
  pokedexCard: PokedexCompareModalCard;
  /** Label for the LEFT image (source surface, e.g. "Stock" or "Vinted"). Falls back to t('thisCard'). */
  currentLabel?: string;
  onClose: () => void;
}

function thumbUrl(card: PokedexCompareModalCard): string | null {
  if (card.image_url) return card.image_url;
  if (card.tcg_image_url) return card.tcg_image_url;
  if (card.pokemon_number != null) {
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${card.pokemon_number}.png`;
  }
  return null;
}

/**
 * Tiny side-by-side preview shown when the user taps the "Pokédex" badge of
 * a card whose pokemon_number slot is already filled. Pure visual diff —
 * no actions, no metrics, no chart.
 */
export default function PokedexCompareModal({ currentCard, pokedexCard, currentLabel, onClose }: Props) {
  const t = useTranslations('pokedexCompare');
  const tCommon = useTranslations('common');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const currentThumb = thumbUrl(currentCard);
  const pokedexThumb = thumbUrl(pokedexCard);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-surface border-border w-full max-w-md rounded-lg border p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold">{t('title')}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={tCommon('close')}
            className="text-text-muted hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <CompareSlot label={currentLabel ?? t('thisCard')} thumb={currentThumb} alt={currentCard.card_name} noImageLabel={tCommon('noImage')} />
          <CompareSlot label={t('pokedexCard')} thumb={pokedexThumb} alt={pokedexCard.card_name} noImageLabel={tCommon('noImage')} />
        </div>

        <p className="text-text-muted text-center text-xs">{t('caption')}</p>
      </div>
    </div>
  );
}

function CompareSlot({
  label,
  thumb,
  alt,
  noImageLabel,
}: {
  label: string;
  thumb: string | null;
  alt: string;
  noImageLabel: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-text-faint text-xs uppercase tracking-wide">{label}</span>
      {thumb ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={thumb}
          alt={alt}
          className="bg-surface-off h-[200px] w-[143px] rounded object-cover"
        />
      ) : (
        <div className="bg-surface-off flex h-[200px] w-[143px] items-center justify-center rounded text-xs text-text-faint">
          {noImageLabel}
        </div>
      )}
    </div>
  );
}
