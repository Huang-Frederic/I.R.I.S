'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { searchPokemon } from '@/lib/utils/pokemon-search';

const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

interface Props {
  /** National dex number, or null when nothing is picked yet. */
  value: number | null;
  onChange: (pokemonNumber: number) => void;
}

/** Search-to-pick Pokémon sprite selector: type a French or English name,
 *  pick from the matches. Reuses the same POKEMON_NAMES dataset and
 *  accent-insensitive matching already used by the Pokédex search. */
export default function PokemonPicker({ value, onChange }: Props) {
  const t = useTranslations('drill');
  const [query, setQuery] = useState('');
  const results = searchPokemon(query);

  return (
    <div className="flex items-start gap-3">
      <div className="border-border bg-surface-2 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${SPRITE_BASE}/${value}.png`}
            alt=""
            className="h-10 w-10"
            style={{ imageRendering: 'pixelated' }}
          />
        ) : (
          <span className="text-text-faint text-lg">?</span>
        )}
      </div>
      <div className="relative flex-1">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPokemonPlaceholder')}
          className="bg-surface-2 border-border focus:border-red w-full rounded-lg border px-3 py-2 text-sm outline-none"
        />
        {results.length > 0 && (
          <ul className="border-border bg-surface absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border shadow-lg">
            {results.map((r) => (
              <li key={r.number}>
                <button
                  type="button"
                  onMouseDown={() => {
                    onChange(r.number);
                    setQuery('');
                  }}
                  className="hover:bg-surface-2 flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${SPRITE_BASE}/${r.number}.png`}
                    alt=""
                    className="h-6 w-6"
                    style={{ imageRendering: 'pixelated' }}
                  />
                  <span>
                    {r.fr}
                    {r.fr !== r.en ? ` (${r.en})` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
