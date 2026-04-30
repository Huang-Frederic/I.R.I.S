// components/vinted/VintedList.tsx
'use client';

import { useMemo, useState } from 'react';
import type { Card } from '@/lib/types';
import { groupCards } from '@/lib/utils/group-cards';
import { sortVintedGroups } from '@/lib/utils/vinted-sort';
import VintedFilters, { INITIAL_FILTERS, type VintedFilterState } from './VintedFilters';
import VintedRow from './VintedRow';
import EditablePriceCell from './EditablePriceCell';
import SoldModal from './SoldModal';
import RestockToast from './RestockToast';
import AnnonceModal from './AnnonceModal';
import type { RestockAlert } from '@/lib/utils/restock-detection';
import type { VintedConfig } from '@/lib/utils/vinted-template';

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

export default function VintedList({ cards: initial, registered, config }: VintedListProps) {
  const [cards, setCards] = useState<Card[]>(initial);
  const [filters, setFilters] = useState<VintedFilterState>(INITIAL_FILTERS);

  const updateCardPrice = (cardId: string, newPrice: number | null) => {
    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, suggested_price: newPrice } : c)),
    );
  };

  const updateCardListed = (cardId: string, listedAt: string | null) => {
    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, vinted_listed_at: listedAt } : c)),
    );
  };

  const [soldTarget, setSoldTarget] = useState<Card | null>(null);
  const [restockAlert, setRestockAlert] = useState<RestockAlert | null>(null);
  const [annonceTarget, setAnnonceTarget] = useState<Card | null>(null);

  const vintedConfig: VintedConfig = {
    vinted_shipping_note: config.vinted_shipping_note ?? '',
    vinted_seller_note: config.vinted_seller_note ?? '',
  };

  const handleSold = ({ soldCardId, restock }: { soldCardId: string; restock: RestockAlert | null }) => {
    setCards((prev) => prev.filter((c) => c.id !== soldCardId));
    setSoldTarget(null);
    if (restock) setRestockAlert(restock);
  };

  const filtered = useMemo(
    () => cards.filter((c) => matchesSearch(c, filters.search) && matchesFilters(c, filters, registered)),
    [cards, filters, registered],
  );
  const groups = useMemo(() => {
    const sorted = sortVintedGroups(groupCards(filtered));
    return sorted.map((g, i) => ({ ...g, position: i + 1 }));
  }, [filtered]);

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
              onAnnonceClick={() => setAnnonceTarget(g.head)}
              onSoldClick={() => setSoldTarget(g.head)}
              onListedToggled={updateCardListed}
            />
          ))}
        </ul>
      )}

      {soldTarget && (
        <SoldModal
          card={soldTarget}
          onClose={() => setSoldTarget(null)}
          onSold={handleSold}
        />
      )}
      {restockAlert && (
        <RestockToast alert={restockAlert} onDismiss={() => setRestockAlert(null)} />
      )}
      {annonceTarget && (
        <AnnonceModal
          card={annonceTarget}
          config={vintedConfig}
          onClose={() => setAnnonceTarget(null)}
          onPriceSaved={updateCardPrice}
        />
      )}
    </div>
  );
}
