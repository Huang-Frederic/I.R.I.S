'use client';

import PokemonPicker from './PokemonPicker';

/** Up to 2 sprite slots per side — pads `dex` to exactly 2 entries with
 *  `null` so a missing second slot still shows an empty picker, and
 *  re-filters `null`s out before calling back up when one changes. Shared
 *  between Battle Logs' deck-confirmation modal and Tournaments' deck
 *  pickers — both let the user fix up to 2 archetype sprites per side. */
export default function DeckSlots({
  label,
  dex,
  onChange,
}: {
  label: string;
  dex: number[];
  onChange: (dex: number[]) => void;
}) {
  const slots = dex.length >= 2 ? dex : [...dex, ...(Array(2 - dex.length).fill(null) as null[])];
  return (
    <div>
      <p className="text-text-muted mb-2 text-xs font-semibold tracking-wide uppercase">{label}</p>
      <div className="flex gap-3">
        {slots.map((n, i) => (
          <PokemonPicker
            key={i}
            value={n}
            onChange={(picked) => {
              const next = [...slots];
              next[i] = picked;
              onChange(next.filter((v): v is number => v !== null));
            }}
          />
        ))}
      </div>
    </div>
  );
}
