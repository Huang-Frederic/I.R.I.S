import Link from 'next/link';
import { RARITY_COLOR } from '@/lib/utils/labels';
import type { Card } from '@/lib/types';

interface Props {
  cards: readonly (Pick<Card, 'id' | 'card_name' | 'pokemon_name' | 'pokemon_number' | 'image_url' | 'tcg_image_url' | 'rarity'> & {
    cm_price_avg: number | null;
    cm_price_trend: number | null;
    cm_price_low: number | null;
  })[];
}

function priceOf(c: Props['cards'][number]): number {
  return c.cm_price_avg ?? c.cm_price_trend ?? c.cm_price_low ?? 0;
}

export default function TopRaresList({ cards }: Props) {
  if (cards.length === 0) {
    return (
      <div className="bg-surface border-border rounded-lg border p-4">
        <h3 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
          Top 10 cartes rares
        </h3>
        <p className="text-text-faint text-sm">Pas encore de cartes avec un prix.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface border-border rounded-lg border p-4">
      <h3 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
        Top 10 cartes rares
      </h3>
      <ul className="divide-border divide-y">
        {cards.map((c) => {
          const inner = (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.image_url ?? c.tcg_image_url ?? ''}
                alt=""
                className="h-12 w-9 rounded object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="text-text truncate text-sm font-medium">{c.card_name}</div>
                <div className="text-text-muted text-xs">
                  <span className={RARITY_COLOR[c.rarity] ?? ''}>{c.rarity}</span>
                </div>
              </div>
              <div className="text-text shrink-0 font-mono text-sm">
                €{priceOf(c).toFixed(2)}
              </div>
            </>
          );
          if (c.pokemon_number !== null) {
            return (
              <li key={c.id}>
                <Link
                  href={`/pokedex?pokemon_number=${c.pokemon_number}`}
                  className="hover:bg-surface-2 flex w-full items-center gap-3 px-2 py-2 text-left transition-colors"
                >
                  {inner}
                </Link>
              </li>
            );
          }
          return (
            <li key={c.id} className="flex items-center gap-3 px-2 py-2">
              {inner}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
