'use client';

import Image from 'next/image';
import type { Card } from '@/lib/types';
import { getPokemonName } from '@/lib/data/pokemon-names';

interface PokedexCellProps {
  number: number;
  card: Card | null;
  onClick: () => void;
}

const SPRITE_BASE =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';

export default function PokedexCell({ number, card, onClick }: PokedexCellProps) {
  const owned = card !== null;
  const label = card?.pokemon_name ?? getPokemonName(number, 'fr');

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${owned ? card!.pokemon_name : getPokemonName(number, 'fr')} n°${number}`}
      className="bg-surface border-border hover:border-red focus:border-red flex flex-col items-center gap-1 rounded border p-2 text-center transition-colors focus:outline-none"
    >
      <Image
        src={`${SPRITE_BASE}${number}.png`}
        alt=""
        width={64}
        height={64}
        loading="lazy"
        unoptimized
        className={owned ? '' : 'opacity-25 brightness-0 saturate-0'}
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
