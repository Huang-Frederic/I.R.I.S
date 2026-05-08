'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ScanLine } from 'lucide-react';
import PokedexScanModal from '../PokedexScanModal';

const SPRITE_BASE =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';

/** Pokédex drawer body when the slot is empty: muted Pokémon sprite + scan CTA. */
export default function EmptyState({ pokemonNumber }: { pokemonNumber: number }) {
  const [scanOpen, setScanOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <Image
          src={`${SPRITE_BASE}${pokemonNumber}.png`}
          alt=""
          width={120}
          height={120}
          unoptimized
          className="opacity-25 brightness-0 saturate-0"
        />
        <p className="text-text-muted text-sm">Aucune carte enregistrée pour ce Pokémon.</p>
        <button
          type="button"
          onClick={() => setScanOpen(true)}
          className="bg-red flex items-center gap-2 rounded px-3 py-2 text-sm font-medium text-white"
        >
          <ScanLine className="h-4 w-4" />
          Scanner une carte
        </button>
      </div>
      {scanOpen && (
        <PokedexScanModal
          pokemonNumber={pokemonNumber}
          onClose={() => setScanOpen(false)}
        />
      )}
    </>
  );
}
