'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FixedSizeList } from 'react-window';
import Modal from '@/components/ui/Modal';
import { searchPokemon, type PokemonSearchResult } from '@/lib/utils/pokemon-search';
import { pokemonSpriteUrl } from '@/lib/utils/pokemon-sprite';

// The grid is virtualized (react-window) rather than rendering all 1025
// sprites at once — cheap on a phone, and avoids a ~1000-node DOM tree.
const COLS = 6;
const ROW_HEIGHT = 64;
const GRID_HEIGHT = 320;

interface Props {
  /** National dex number, or null when nothing is picked yet. */
  value: number | null;
  onChange: (pokemonNumber: number) => void;
}

/** Emoji-picker-style sprite selector: click the circle to open a searchable
 *  grid of the full dex (French/English name), click a sprite to pick it. */
export default function PokemonPicker({ value, onChange }: Props) {
  const t = useTranslations('drill');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const results = searchPokemon(query);
  const rows = useMemo(() => {
    const chunks: PokemonSearchResult[][] = [];
    for (let i = 0; i < results.length; i += COLS) chunks.push(results.slice(i, i + COLS));
    return chunks;
  }, [results]);

  function pick(number: number) {
    onChange(number);
    setOpen(false);
    setQuery('');
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('profileSpriteLabel')}
        className="border-border bg-surface-2 hover:border-red flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 transition"
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pokemonSpriteUrl(value) ?? undefined}
            alt=""
            className="pixel-sprite max-h-12 max-w-12"
          />
        ) : (
          <span className="text-text-faint text-xl">?</span>
        )}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        ariaLabel={t('profileSpriteLabel')}
        layout="bottom-sheet"
        className="bg-surface border-border flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl border"
      >
        <div className="border-border border-b p-3">
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPokemonPlaceholder')}
            className="bg-surface-2 border-border focus:border-red w-full rounded-lg border px-3 py-2 text-sm outline-none"
          />
        </div>
        <FixedSizeList height={GRID_HEIGHT} itemCount={rows.length} itemSize={ROW_HEIGHT} width="100%">
          {({ index, style }) => (
            <div style={style} className="flex gap-1 px-3">
              {rows[index].map((r) => (
                <button
                  key={r.number}
                  type="button"
                  onClick={() => pick(r.number)}
                  className="hover:bg-surface-2 flex flex-1 items-center justify-center rounded-lg p-1.5"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pokemonSpriteUrl(r.number) ?? undefined}
                    alt={r.fr}
                    loading="lazy"
                    className="pixel-sprite max-h-12 max-w-12"
                  />
                </button>
              ))}
            </div>
          )}
        </FixedSizeList>
      </Modal>
    </>
  );
}
