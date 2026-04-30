'use client';

import { useMemo, useState } from 'react';
import type { Card } from '@/lib/types';
import { GENERATIONS } from '@/lib/utils/pokemon-generations';
import { POKEMON_NAMES } from '@/lib/data/pokemon-names';
import PokedexCell from './PokedexCell';
import PokedexDrawer from './PokedexDrawer';
import PokedexFilters, { type FilterState, type ViewMode } from './PokedexFilters';
import PokedexListItem from './PokedexListItem';

interface PokedexGridProps {
  cards: Card[];
}

const TOTAL_POKEMON = 1025;
const ALL_NUMBERS = Array.from({ length: TOTAL_POKEMON }, (_, i) => i + 1);

const VIEW_MODE_KEY = 'iris.pokedex.viewMode';

function getInitialViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'grid-compact';
  const stored = localStorage.getItem(VIEW_MODE_KEY);
  if (stored === 'grid-large' || stored === 'grid-compact' || stored === 'list') {
    return stored;
  }
  // Migration from old mode names
  if (stored === 'grid-3') return 'grid-large';
  if (stored === 'grid-5') return 'grid-compact';
  return 'grid-compact';
}

export default function PokedexGrid({ cards }: PokedexGridProps) {
  const [selectedPokemon, setSelectedPokemon] = useState<number | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    gen: 'all',
    status: 'all',
    search: '',
  });
  const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode);

  // Persist view mode to localStorage
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
  };

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

  const gridClasses = {
    'grid-large': 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3',
    'grid-compact': 'grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2',
    'list': 'flex flex-col gap-1',
  }[viewMode];

  return (
    <>
      <PokedexFilters
        value={filters}
        onChange={setFilters}
        total={TOTAL_POKEMON}
        visible={visibleNumbers.length}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
      />

      {visibleNumbers.length === 0 ? (
        <p className="text-text-muted bg-surface border-border rounded-lg border p-6 text-center text-sm">
          Aucun Pokémon ne correspond aux filtres.
        </p>
      ) : (
        <div className={`${gridClasses} transition-all duration-200`}>
          {visibleNumbers.map((n) => {
            const card = pokedexMap.get(n) ?? null;
            return viewMode === 'list' ? (
              <PokedexListItem
                key={n}
                number={n}
                card={card}
                onClick={() => setSelectedPokemon(n)}
              />
            ) : (
              <PokedexCell
                key={n}
                number={n}
                card={card}
                onClick={() => setSelectedPokemon(n)}
              />
            );
          })}
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

  const search = filters.search.trim();
  if (search.length > 0) {
    // Number search: parse query, match exactly. Handles `0003` → 3, `12` → 12 (not 125).
    const numQuery = parseInt(search.replace(/^#?0*/, ''), 10);
    if (!isNaN(numQuery) && n === numQuery) return true;

    // Name search: normalize NFD + lowercase, match across card.pokemon_name + FR + EN.
    const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    const q = normalize(search);
    const names = [
      card?.pokemon_name,
      POKEMON_NAMES[n]?.fr,
      POKEMON_NAMES[n]?.en,
    ].filter((s): s is string => typeof s === 'string' && s.length > 0);
    if (names.some((name) => normalize(name).includes(q))) return true;

    return false;
  }

  return true;
}
