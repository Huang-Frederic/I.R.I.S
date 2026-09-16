'use client';

import { pokemonSpriteUrl } from '@/lib/utils/pokemon-sprite';

/** Up to 2 overlapping pixel sprites for an archetype's dex numbers, or a
 *  neutral placeholder circle when there's nothing to show (unclassified, no
 *  override set yet). Shared between the Battle Logs list and the Stats
 *  drill-down — both show "which Pokémon represent this side" the same way. */
export default function DeckSprites({ dex }: { dex: number[] | null }) {
  if (!dex || dex.length === 0) {
    return <div className="bg-surface-2 h-8 w-8 shrink-0 rounded-full" />;
  }
  return (
    <div className="flex -space-x-2">
      {dex.map((n) => {
        const url = pokemonSpriteUrl(n);
        return url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={n}
            src={url}
            alt=""
            loading="lazy"
            className="pixel-sprite border-surface h-8 w-8 rounded-full border-2"
          />
        ) : null;
      })}
    </div>
  );
}
