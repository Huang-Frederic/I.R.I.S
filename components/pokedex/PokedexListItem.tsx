'use client';

import Image from 'next/image';
import type { Card } from '@/lib/types';
import { getPokemonName } from '@/lib/data/pokemon-names';

interface PokedexListItemProps {
  number: number;
  card: Card | null;
  onClick: () => void;
}

const SPRITE_BASE =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';

const RARITY_CLASS: Record<string, string> = {
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

export default function PokedexListItem({ number, card, onClick }: PokedexListItemProps) {
  const owned = card !== null;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${owned ? card!.pokemon_name : getPokemonName(number, 'fr')} n°${number}`}
      className="bg-surface border-border hover:border-red focus:border-red flex items-center gap-3 rounded border p-2 text-left transition-colors focus:outline-none"
    >
      <div className="shrink-0">
        <Image
          src={`${SPRITE_BASE}${number}.png`}
          alt=""
          width={56}
          height={56}
          loading="lazy"
          unoptimized
          className={owned ? '' : 'opacity-50'}
          style={owned ? undefined : {
            filter: 'brightness(0) invert(40%) sepia(90%) saturate(2900%) hue-rotate(335deg) brightness(95%)',
          }}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline gap-2">
          <span className="text-text-faint font-mono text-xs">
            #{number.toString().padStart(4, '0')}
          </span>
          <span className={`truncate text-sm font-medium ${owned ? 'text-text' : 'text-text-muted'}`}>
            {card?.pokemon_name ?? getPokemonName(number, 'fr')}
          </span>
        </div>

        {owned && card && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-text-muted truncate">{card.card_name}</span>
            <span className={RARITY_CLASS[card.rarity] ?? 'text-text-muted'}>
              {card.rarity}
            </span>
            {card.cm_price_trend !== null && (
              <span className="text-rarity-sr font-mono font-semibold">
                {card.cm_price_trend.toFixed(2)} €
              </span>
            )}
            {card.suggested_price !== null && card.cm_price_trend === null && (
              <span className="text-text-muted font-mono">
                ~{card.suggested_price.toFixed(2)} €
              </span>
            )}
          </div>
        )}

        {!owned && (
          <span className="text-text-faint text-xs">Manquant</span>
        )}
      </div>

      <div className="shrink-0">
        {owned ? (
          <div className="bg-red-bg text-red rounded-full px-2 py-0.5 text-[10px] font-medium">
            ✓
          </div>
        ) : (
          <div className="bg-surface-2 text-text-faint rounded-full px-2 py-0.5 text-[10px]">
            —
          </div>
        )}
      </div>
    </button>
  );
}
