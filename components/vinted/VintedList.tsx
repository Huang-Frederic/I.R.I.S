// components/vinted/VintedList.tsx
'use client';

import { useMemo, useState } from 'react';
import type { Card } from '@/lib/types';
import { groupCards } from '@/lib/utils/group-cards';
import VintedFilters, { INITIAL_FILTERS, type VintedFilterState } from './VintedFilters';
import VintedRow from './VintedRow';
import EditablePriceCell from './EditablePriceCell';

export interface VintedListProps {
  cards: Card[];
  registered: Set<number>;
  config: Record<string, string>;
}

function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function matchesSearch(card: Card, query: string): boolean {
  if (!query) return true;
  const q = normalize(query);
  const fields = [
    card.set_number, card.card_name, card.pokemon_name,
    card.set_name, card.set_code, card.language, card.rarity,
  ];
  return fields.some((f) => f && normalize(f).includes(q));
}

function matchesFilters(card: Card, f: VintedFilterState, registered: Set<number>): boolean {
  if (f.language !== 'all' && card.language !== f.language) return false;
  if (f.rarity !== 'all' && card.rarity !== f.rarity) return false;
  if (f.variant !== 'all') {
    const variant = card.variant ?? 'standard';
    if (variant !== f.variant) return false;
  }
  if (f.registered === 'yes' && !registered.has(card.pokemon_number)) return false;
  if (f.registered === 'no' && registered.has(card.pokemon_number)) return false;
  return true;
}

export default function VintedList({ cards: initial, registered }: VintedListProps) {
  const [cards, setCards] = useState<Card[]>(initial);
  const [filters, setFilters] = useState<VintedFilterState>(INITIAL_FILTERS);

  const updateCardPrice = (cardId: string, newPrice: number | null) => {
    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, suggested_price: newPrice } : c)),
    );
  };

  const filtered = useMemo(
    () => cards.filter((c) => matchesSearch(c, filters.search) && matchesFilters(c, filters, registered)),
    [cards, filters, registered],
  );
  const groups = useMemo(() => groupCards(filtered), [filtered]);

  return (
    <div>
      <VintedFilters
        value={filters}
        onChange={setFilters}
        visibleCards={filtered.length}
        visibleGroups={groups.length}
        totalCards={cards.length}
      />

      {groups.length === 0 ? (
        <div className="bg-surface border-border rounded-lg border p-6">
          <p className="text-text-muted text-sm">Aucune carte ne correspond aux filtres.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {groups.map((g) => (
            <VintedRow
              key={g.key}
              group={g}
              isRegistered={registered.has(g.head.pokemon_number)}
              priceCell={
                <EditablePriceCell
                  cardId={g.head.id}
                  initialPrice={g.head.suggested_price}
                  onSaved={(newPrice) => updateCardPrice(g.head.id, newPrice)}
                />
              }
              onAnnonceClick={() => {/* wired in Task 10 */}}
              onSoldClick={() => {/* wired in Task 9 */}}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
