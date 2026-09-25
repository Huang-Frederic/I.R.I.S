'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { FixedSizeList } from 'react-window';
import Modal from '@/components/ui/Modal';
import { searchPokemon, type PokemonSearchResult } from '@/lib/utils/pokemon-search';
import { pokemonSpriteUrl } from '@/lib/utils/pokemon-sprite';
import { encodeMegaDex } from '@/lib/data/pokemon-names';

// The grid is virtualized (react-window) rather than rendering all 1025
// sprites at once — cheap on a phone, and avoids a ~1000-node DOM tree.
const COLS = 6;
const ROW_HEIGHT = 64;
const GRID_HEIGHT = 320;

// The only two species that have ever had TWO simultaneous Mega forms. The
// Mega toggle below has no per-species X/Y picker (no current card needs
// one), so a dual-form pick defaults to X — see encodeMegaDex.
const DUAL_FORM_DEX = new Set([6, 150]);

interface Props {
  /** National dex number, or null when nothing is picked yet. */
  value: number | null;
  onChange: (pokemonNumber: number | null) => void;
}

/** Emoji-picker-style sprite selector: click the circle to open a searchable
 *  grid of the full dex (French/English name), click a sprite to pick it.
 *  The very first grid tile is always a "clear" option (`null`) — an
 *  auto-detected sprite the user doesn't want has to be removable, not just
 *  replaceable with another real Pokémon. */
export default function PokemonPicker({ value, onChange }: Props) {
  const t = useTranslations('drill');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [mega, setMega] = useState(false);
  const results = searchPokemon(query);
  const items: (PokemonSearchResult | null)[] = useMemo(() => [null, ...results], [results]);
  const rows = useMemo(() => {
    const chunks: (PokemonSearchResult | null)[][] = [];
    for (let i = 0; i < items.length; i += COLS) chunks.push(items.slice(i, i + COLS));
    return chunks;
  }, [items]);

  function pick(number: number | null) {
    onChange(number === null || !mega ? number : encodeMegaDex(number, DUAL_FORM_DEX.has(number) ? 'x' : undefined));
    setOpen(false);
    setQuery('');
    setMega(false);
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
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPokemonPlaceholder')}
            className="bg-surface-2 border-border focus:border-red w-full rounded-lg border px-3 py-2 text-sm outline-none"
          />
          <label className="text-text-muted mt-2 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={mega} onChange={(e) => setMega(e.target.checked)} />
            {t('megaToggleLabel')}
          </label>
        </div>
        <FixedSizeList height={GRID_HEIGHT} itemCount={rows.length} itemSize={ROW_HEIGHT} width="100%">
          {({ index, style }) => (
            <div style={style} className="flex gap-1 px-3">
              {rows[index].map((r) =>
                r === null ? (
                  <button
                    key="clear"
                    type="button"
                    onClick={() => pick(null)}
                    aria-label={t('clearSpriteLabel')}
                    className="hover:bg-surface-2 border-border flex flex-1 items-center justify-center rounded-lg border border-dashed p-1.5"
                  >
                    <X className="text-text-faint h-5 w-5" aria-hidden />
                  </button>
                ) : (
                  <button
                    key={r.number}
                    type="button"
                    onClick={() => pick(r.number)}
                    className="hover:bg-surface-2 flex flex-1 items-center justify-center rounded-lg p-1.5"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={
                        (mega
                          ? pokemonSpriteUrl(encodeMegaDex(r.number, DUAL_FORM_DEX.has(r.number) ? 'x' : undefined))
                          : pokemonSpriteUrl(r.number)) ?? undefined
                      }
                      alt={r.fr}
                      loading="lazy"
                      className="pixel-sprite max-h-12 max-w-12"
                      // The "Méga" toggle changed nothing visible in the grid
                      // before this — every tile kept showing the base-form
                      // sprite, so checking it looked like it did nothing.
                      // Most species have no Mega form at all, so falling
                      // back to the base sprite on a 404 avoids a grid full
                      // of broken images for everything except the ~46 that do.
                      onError={(e) => {
                        if (mega) e.currentTarget.src = pokemonSpriteUrl(r.number) ?? '';
                      }}
                    />
                  </button>
                ),
              )}
            </div>
          )}
        </FixedSizeList>
      </Modal>
    </>
  );
}
