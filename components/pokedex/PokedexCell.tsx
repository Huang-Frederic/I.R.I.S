'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import type { Card } from '@/lib/types';
import { getPokemonName } from '@/lib/data/pokemon-names';
import { displayPokemonName } from '@/lib/utils/format-name';

interface PokedexCellProps {
  number: number;
  card: Card | null;
  /** Stable callback receiving the cell's number — keeps memo() effective
   *  (an inline `() => …` closure per cell would defeat it). */
  onSelect: (number: number) => void;
}

const SPRITE_BASE =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';

// memo: the grid renders up to 1025 cells; without it every drawer
// open/close re-renders them all. content-visibility skips offscreen paint.
export default memo(function PokedexCell({ number, card, onSelect }: PokedexCellProps) {
  const t = useTranslations('pokedex');
  const owned = card !== null;
  const label = card ? displayPokemonName(card) : getPokemonName(number, 'fr');

  return (
    <button
      type="button"
      onClick={() => onSelect(number)}
      aria-label={t('cellAria', { name: label, number })}
      data-pokemon-number={number}
      className="bg-surface border-border hover:border-red focus:border-red [content-visibility:auto] [contain-intrinsic-size:auto_150px] flex flex-col items-center gap-1 rounded border p-2 text-center transition-colors focus:outline-none"
    >
      <Image
        src={`${SPRITE_BASE}${number}.png`}
        alt=""
        width={80}
        height={80}
        loading="lazy"
        unoptimized
        className={owned ? '' : 'opacity-50'}
        style={owned ? undefined : {
          filter: 'brightness(0) invert(40%) sepia(90%) saturate(2900%) hue-rotate(335deg) brightness(95%)',
        }}
      />
      <span className="text-text-faint font-mono text-[10px]">
        #{number.toString().padStart(4, '0')}
      </span>
      <span
        className={`w-full truncate text-[11px] ${owned ? 'text-text' : 'text-text-faint'}`}
      >
        {label}
      </span>
    </button>
  );
});
