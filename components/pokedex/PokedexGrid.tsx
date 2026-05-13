'use client';

import { useMemo, useState, useSyncExternalStore, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import type { Card, CardRarity } from '@/lib/types';
import { GENERATIONS } from '@/lib/utils/pokemon-generations';
import { normalizeForSearch } from '@/lib/utils/text-normalize';
import { POKEMON_NAMES } from '@/lib/data/pokemon-names';
import { PriceTrendsProvider } from '@/components/ui/PriceTrendsProvider';
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
const DEFAULT_VIEW_MODE: ViewMode = 'grid-compact';
const VIEW_MODE_CHANGE_EVENT = 'iris:pokedex:view-mode-change';

function readStoredViewMode(): ViewMode {
  if (typeof window === 'undefined') return DEFAULT_VIEW_MODE;
  const stored = localStorage.getItem(VIEW_MODE_KEY);
  if (stored === 'grid-large' || stored === 'grid-compact' || stored === 'list') {
    return stored;
  }
  // Migration from old mode names — kept around so users who set their
  // preference before the rename still see the right view.
  if (stored === 'grid-3') return 'grid-large';
  if (stored === 'grid-5') return 'grid-compact';
  return DEFAULT_VIEW_MODE;
}

/**
 * useSyncExternalStore lets us treat localStorage as the source of truth and
 * gives React a proper server snapshot — so the SSR pass renders the default,
 * the client's first paint matches, and the next paint adopts the persisted
 * preference. No setState-in-effect, no hydration mismatch.
 */
function subscribeViewMode(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  // Cross-tab via the native storage event; same-tab via a custom event we
  // dispatch ourselves from handleViewModeChange.
  window.addEventListener('storage', callback);
  window.addEventListener(VIEW_MODE_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(VIEW_MODE_CHANGE_EVENT, callback);
  };
}

export default function PokedexGrid({ cards }: PokedexGridProps) {
  const t = useTranslations('pokedex');
  const searchParams = useSearchParams();

  // Parse URL parameters once on mount
  const initialPokemonNumber = (() => {
    const raw = searchParams.get('pokemon_number');
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 1 && n <= 1025 ? n : null;
  })();
  const initialRarity = (() => {
    const raw = searchParams.get('rarity');
    const valid = ['SAR', 'AR', 'SR', 'CHR', 'RR', 'R_HOLO', 'R', 'UC', 'C', 'OTHER'];
    if (raw && valid.includes(raw)) return raw as CardRarity;
    return 'all' as const;
  })();

  const [selectedPokemon, setSelectedPokemon] = useState<number | null>(initialPokemonNumber);
  const [filters, setFilters] = useState<FilterState>({
    gen: 'all',
    status: 'all',
    search: '',
    rarity: initialRarity,
  });
  const viewMode = useSyncExternalStore(
    subscribeViewMode,
    readStoredViewMode,
    () => DEFAULT_VIEW_MODE,
  );

  const handleViewModeChange = (mode: ViewMode) => {
    localStorage.setItem(VIEW_MODE_KEY, mode);
    window.dispatchEvent(new Event(VIEW_MODE_CHANGE_EVENT));
  };

  // Auto-scroll to selected pokemon when set via URL
  useEffect(() => {
    if (initialPokemonNumber == null) return;
    // Wait one tick for the grid to render, then scroll the cell into view.
    const t = setTimeout(() => {
      const cell = document.querySelector(`[data-pokemon-number="${initialPokemonNumber}"]`);
      if (cell) cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    return () => clearTimeout(t);
  }, [initialPokemonNumber]);

  // pokedexMap: one card per pokemon (status='pokedex' enforced by the partial unique index)
  // availableMap: every other card the user owns, grouped by pokemon — feeds the
  // "Replace by..." picker in the drawer.
  const { pokedexMap, availableMap } = useMemo(() => {
    const pm = new Map<number, Card>();
    const am = new Map<number, Card[]>();
    for (const c of cards) {
      // Trainer/Energy/Stadium cards have null pokemon_number — they have no
      // Pokédex slot, so they're irrelevant to this map.
      if (c.pokemon_number == null) continue;
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
    'grid-large': 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3',
    'grid-compact': 'grid grid-cols-4 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 gap-2',
    'list': 'flex flex-col gap-1',
  }[viewMode];

  return (
    <PriceTrendsProvider>
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
          {t('emptyFiltered')}
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
    </PriceTrendsProvider>
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

  // Rarity filter: only show slots where the registered card matches the rarity.
  // Slots without a card never match a specific rarity filter.
  if (filters.rarity !== 'all') {
    if (!card || card.rarity !== filters.rarity) return false;
  }

  const search = filters.search.trim();
  if (search.length > 0) {
    // Number search: parse query, match exactly. Handles `0003` → 3, `12` → 12 (not 125).
    const numQuery = parseInt(search.replace(/^#?0*/, ''), 10);
    if (!isNaN(numQuery) && n === numQuery) return true;

    // Name search: normalize NFD + lowercase, match across card.pokemon_name + FR + EN.
    const q = normalizeForSearch(search);
    const names = [
      card?.pokemon_name,
      POKEMON_NAMES[n]?.fr,
      POKEMON_NAMES[n]?.en,
    ].filter((s): s is string => typeof s === 'string' && s.length > 0);
    if (names.some((name) => normalizeForSearch(name).includes(q))) return true;

    return false;
  }

  return true;
}
