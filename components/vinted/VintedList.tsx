// components/vinted/VintedList.tsx
'use client';

import { useMemo, useState } from 'react';
import type { Card } from '@/lib/types';
import { groupCards } from '@/lib/utils/group-cards';
import { sortVintedGroups } from '@/lib/utils/vinted-sort';
import VintedFilters, { INITIAL_FILTERS, type VintedFilterState } from './VintedFilters';
import VintedRow from './VintedRow';
import SoldRow from './SoldRow';
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

const STALE_DAYS = 21;
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;

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

function matchesAttrFilters(card: Card, f: VintedFilterState): boolean {
  if (f.language !== 'all' && card.language !== f.language) return false;
  if (f.rarity !== 'all' && card.rarity !== f.rarity) return false;
  if (f.variant !== 'all') {
    const variant = card.variant ?? 'standard';
    if (variant !== f.variant) return false;
  }
  return true;
}

function isStale(card: Card, now: number): boolean {
  const ref = card.cm_updated_at ?? card.date_added;
  if (!ref) return false;
  return now - new Date(ref).getTime() > STALE_MS;
}

export default function VintedList({ cards: initial, registered, config }: VintedListProps) {
  const [cards, setCards] = useState<Card[]>(initial);
  const [filters, setFilters] = useState<VintedFilterState>(INITIAL_FILTERS);
  const [now] = useState(() => Date.now());

  const updateCardPrice = (cardId: string, newPrice: number | null) => {
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, suggested_price: newPrice } : c)));
  };

  const updateCardListed = (cardId: string, listedAt: string | null) => {
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, vinted_listed_at: listedAt } : c)));
  };

  const [soldTarget, setSoldTarget] = useState<Card | null>(null);
  const [restockAlert, setRestockAlert] = useState<RestockAlert | null>(null);
  const [annonceTarget, setAnnonceTarget] = useState<Card | null>(null);

  const vintedConfig: VintedConfig = {
    vinted_shipping_note: config.vinted_shipping_note ?? '',
    vinted_seller_note: config.vinted_seller_note ?? '',
  };

  const handleSold = ({ soldCardId, restock }: { soldCardId: string; restock: RestockAlert | null }) => {
    // Mark the card as sold in local state instead of removing it (so it shows up under Vendus filter).
    setCards((prev) =>
      prev.map((c) =>
        c.id === soldCardId
          ? { ...c, status: 'sold' as const, date_sold: new Date().toISOString() }
          : c,
      ),
    );
    setSoldTarget(null);
    if (restock) setRestockAlert(restock);
  };

  const { groups, soldRows, totalVisible } = useMemo(() => {
    // Split by status
    const forSale = cards.filter((c) => c.status === 'for_sale');
    const sold = cards.filter((c) => c.status === 'sold');

    // Apply attribute + search + stale filters separately
    const passesCommon = (c: Card) =>
      matchesSearch(c, filters.search) &&
      matchesAttrFilters(c, filters) &&
      (!filters.showStale || isStale(c, now));

    // For-sale subset depending on online/offline chips
    let forSaleSubset = forSale.filter(passesCommon);
    const onOnly = filters.showOnline && !filters.showOffline;
    const offOnly = !filters.showOnline && filters.showOffline;
    if (onOnly) {
      forSaleSubset = forSaleSubset.filter((c) => c.vinted_listed_at !== null);
    } else if (offOnly) {
      forSaleSubset = forSaleSubset.filter((c) => c.vinted_listed_at === null);
    }
    // Both on or both off → no extra filter (show all for_sale)

    // Logic: if Vendus is the ONLY active chip (showSold=true, others false) → hide for_sale.
    // Otherwise (no chips OR sold + others) → show for_sale.
    const onlySoldActive = filters.showSold && !filters.showOnline && !filters.showOffline;
    const finalForSale = onlySoldActive ? [] : forSaleSubset;

    // Sold subset: included only when showSold chip is active
    const soldSubset = filters.showSold
      ? sold.filter(passesCommon).sort((a, b) => (b.date_sold ?? '').localeCompare(a.date_sold ?? ''))
      : [];

    // Group + sort for_sale
    const sorted = sortVintedGroups(groupCards(finalForSale)).map((g, i) => ({ ...g, position: i + 1 }));

    return { groups: sorted, soldRows: soldSubset, totalVisible: finalForSale.length + soldSubset.length };
  }, [cards, filters, now]);

  const isEmpty = groups.length === 0 && soldRows.length === 0;

  return (
    <div>
      <VintedFilters
        value={filters}
        onChange={setFilters}
        visibleCards={totalVisible}
        totalCards={cards.length}
      />

      {isEmpty ? (
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
          {soldRows.map((c) => (
            <SoldRow key={c.id} card={c} />
          ))}
        </ul>
      )}

      {soldTarget && (
        <SoldModal card={soldTarget} onClose={() => setSoldTarget(null)} onSold={handleSold} />
      )}
      {restockAlert && <RestockToast alert={restockAlert} onDismiss={() => setRestockAlert(null)} />}
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
