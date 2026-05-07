import Link from 'next/link';
import { RARITY_COLOR } from '@/lib/utils/labels';
import { getPokemonName } from '@/lib/data/pokemon-names';
import type { Card } from '@/lib/types';

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

function formatDate(iso: string | null): string {
  if (!iso) return '?';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export default function LastPokedexAdds({ adds }: { adds: readonly PokedexAddCard[] }) {
  if (adds.length === 0) {
    return (
      <div className="bg-surface border-border rounded-lg border p-4">
        <h3 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
          Derniers ajouts au Pokédex
        </h3>
        <p className="text-text-faint text-sm">Pas encore d&apos;entrée dans le Pokédex.</p>
      </div>
    );
  }
  return (
    <div className="bg-surface border-border rounded-lg border p-4">
      <h3 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
        Derniers ajouts au Pokédex
      </h3>
      <ul className="divide-border divide-y">
        {adds.map((c) => {
          const displayName = c.pokemon_number ? getPokemonName(c.pokemon_number, 'fr') : c.card_name;
          const numLabel = c.pokemon_number ? `#${String(c.pokemon_number).padStart(4, '0')}` : '';
          return (
            <li key={c.id}>
              <Link
                href={c.pokemon_number ? `/pokedex?pokemon_number=${c.pokemon_number}` : '/pokedex'}
                className="hover:bg-surface-2 flex items-center gap-3 py-2 transition-colors"
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
    </div>
  );
}
