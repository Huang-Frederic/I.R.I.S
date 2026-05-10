'use client';

import Image from 'next/image';
import type { Card } from '@/lib/types';
import { getPokemonName } from '@/lib/data/pokemon-names';
import { displayPokemonName } from '@/lib/utils/format-name';

interface PokedexCellProps {
  number: number;
  card: Card | null;
  onClick: () => void;
}

const SPRITE_BASE =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';

export default function PokedexCell({ number, card, onClick }: PokedexCellProps) {
  const owned = card !== null;
  const label = card ? displayPokemonName(card) : getPokemonName(number, 'fr');

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${owned ? displayPokemonName(card!) : getPokemonName(number, 'fr')} n°${number}`}
      data-pokemon-number={number}
      className="bg-surface border-border hover:border-red focus:border-red flex flex-col items-center gap-1 rounded border p-2 text-center transition-colors focus:outline-none"
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
}
