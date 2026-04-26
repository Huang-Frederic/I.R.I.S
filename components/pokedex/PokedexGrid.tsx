'use client';

import { useMemo, useState } from 'react';
import type { Card } from '@/lib/types';
import { GENERATIONS } from '@/lib/utils/pokemon-generations';
import PokedexCell from './PokedexCell';
import PokedexDrawer from './PokedexDrawer';
import PokedexFilters, { type FilterState } from './PokedexFilters';

interface PokedexGridProps {
  cards: Card[];
}

const TOTAL_POKEMON = 1025;
const ALL_NUMBERS = Array.from({ length: TOTAL_POKEMON }, (_, i) => i + 1);

export default function PokedexGrid({ cards }: PokedexGridProps) {
  const [selectedPokemon, setSelectedPokemon] = useState<number | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    gen: 'all',
    status: 'all',
    search: '',
  });

  // pokedexMap: one card per pokemon (status='pokedex' enforced by the partial unique index)
  // availableMap: every other card the user owns, grouped by pokemon — feeds the
  // "Replace by..." picker in the drawer.
  const { pokedexMap, availableMap } = useMemo(() => {
    const pm = new Map<number, Card>();
    const am = new Map<number, Card[]>();
    for (const c of cards) {
      if (c.status === 'pokedex') {
        pm.set(c.pokemon_number, c);
      } else if (c.status === 'for_sale' || c.status === 'collection') {
        const list = am.get(c.pokemon_number);
        if (list) list.push(c);
        else am.set(c.pokemon_number, [c]);
      }
    }
    return { pokedexMap: pm, availableMap: am };
  }, [cards]);

  const visibleNumbers = useMemo(
    () => ALL_NUMBERS.filter((n) => matches(n, pokedexMap, filters)),
    [filters, pokedexMap],
  );

  const selectedCard = selectedPokemon !== null ? (pokedexMap.get(selectedPokemon) ?? null) : null;
  const selectedAvailable =
    selectedPokemon !== null ? (availableMap.get(selectedPokemon) ?? []) : [];

  return (
    <>
      <PokedexFilters
        value={filters}
        onChange={setFilters}
        total={TOTAL_POKEMON}
        visible={visibleNumbers.length}
      />

      {visibleNumbers.length === 0 ? (
        <p className="text-text-muted bg-surface border-border rounded-lg border p-6 text-center text-sm">
          Aucun Pokémon ne correspond aux filtres.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2">
          {visibleNumbers.map((n) => (
            <PokedexCell
              key={n}
              number={n}
              card={pokedexMap.get(n) ?? null}
              onClick={() => setSelectedPokemon(n)}
            />
          ))}
        </div>
      )}

      <PokedexDrawer
        open={selectedPokemon !== null}
        onClose={() => setSelectedPokemon(null)}
        pokemonNumber={selectedPokemon}
        pokedexCard={selectedCard}
        availableCards={selectedAvailable}
      />
    </>
  );
}

function matches(n: number, pokedexMap: Map<number, Card>, filters: FilterState): boolean {
  if (filters.gen !== 'all') {
    const gen = GENERATIONS.find((g) => g.id === filters.gen);
    if (gen && (n < gen.start || n > gen.end)) return false;
  }

  const card = pokedexMap.get(n);
  if (filters.status === 'completed' && !card) return false;
  if (filters.status === 'missing' && card) return false;

  const search = filters.search.trim().toLowerCase();
  if (search.length > 0) {
    const numMatch = String(n).includes(search);
    const nameMatch = card?.pokemon_name.toLowerCase().includes(search) ?? false;
    if (!numMatch && !nameMatch) return false;
  }

  return true;
}
