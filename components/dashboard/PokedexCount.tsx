import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { RARITY_COLOR } from '@/lib/utils/labels';
import type { Card } from '@/lib/types';
import { displayPokemonName, displayCardName } from '@/lib/utils/format-name';

interface PokedexAddCard {
  id: string;
  card_name: string;
  pokemon_name: string | null;
  pokemon_number: number | null;
  image_url: string | null;
  tcg_image_url: string | null;
  rarity: Card['rarity'];
  date_added: string;
}

interface Props {
  /** Number of distinct pokemon_number with status='pokedex'. */
  collected: number;
  /** Total of the National Dex covered by the app (1025 for gen 1-9). */
  total?: number;
  /** Recent Pokédex additions to show below the headline. */
  adds?: readonly PokedexAddCard[];
}

function formatDate(iso: string | null): string {
  if (!iso) return '?';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export default function PokedexCount({ collected, total = 1025, adds = [] }: Props) {
  const pct = total > 0 ? (collected / total) * 100 : 0;
  return (
    <div className="bg-surface border-border flex flex-col rounded-lg border p-4">
      <Link
        href="/pokedex"
        className="hover:text-text -m-1 block rounded p-1 transition-colors"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-text-muted text-xs font-semibold uppercase tracking-wide">
            Pokédex
          </h3>
          <BookOpen className="text-text-faint h-4 w-4" />
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-text text-3xl font-semibold">{collected}</span>
          <span className="text-text-muted text-sm">/ {total}</span>
          <span className="text-text-faint ml-auto text-xs">{pct.toFixed(1)}%</span>
        </div>
        <div className="bg-surface-2 mt-3 h-2 overflow-hidden rounded-full">
          <div
            className="bg-red h-full transition-all"
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      </Link>

      {adds.length > 0 && (
        <>
          <hr className="border-border my-4" />
          <h4 className="text-text-muted mb-2 text-xs font-semibold uppercase tracking-wide">
            Derniers ajouts
          </h4>
          <ul className="divide-border divide-y">
            {adds.map((c) => {
              const displayName = c.pokemon_number ? displayPokemonName(c) : displayCardName(c);
              const numLabel = c.pokemon_number ? `#${String(c.pokemon_number).padStart(4, '0')}` : '';
              return (
                <li key={c.id}>
                  <Link
                    href={c.pokemon_number ? `/pokedex?pokemon_number=${c.pokemon_number}` : '/pokedex'}
                    className="hover:bg-surface-2 -mx-1 flex items-center gap-3 rounded px-1 py-2 transition-colors"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.image_url ?? c.tcg_image_url ?? ''} alt="" className="h-12 w-9 rounded object-cover" />
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="text-text truncate font-medium">{displayName}</div>
                      <div className="text-text-muted text-xs mt-0.5">
                        <span className="text-text-faint">{numLabel}</span>
                        <span className={`ml-2 ${RARITY_COLOR[c.rarity] ?? ''}`}>{c.rarity}</span>
                      </div>
                    </div>
                    <div className="text-text-faint shrink-0 text-xs" suppressHydrationWarning>
                      {formatDate(c.date_added)}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
