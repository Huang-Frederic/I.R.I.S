'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Card } from '@/lib/types';
import { groupCards, groupKey } from '@/lib/utils/group-cards';
import StockFilters, { INITIAL_STOCK_FILTERS, type StockFilterState } from './StockFilters';
import StockRow from './StockRow';
import ExchangeOnConflictModal, { type ExchangeConflictCard } from '@/components/vinted/ExchangeOnConflictModal';
import MoveToPokedexModal from '@/components/cards/MoveToPokedexModal';

export interface StockListProps {
  cards: Card[];
  forSaleKeys: Set<string>;
  /** pokemon_number set for cards already in the Pokédex. Drives the badge. */
  registered: Set<number>;
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

/** Same composite key as the API/page — keeps the for_sale lookup consistent. */
function stockMatchKey(card: Card): string {
  return `${card.card_id_tcg ?? ''}|${card.language}|${card.condition}|${card.variant ?? 'standard'}`;
}

function matchesFilters(card: Card, f: StockFilterState, hasForSale: boolean): boolean {
  if (f.language !== 'all' && card.language !== f.language) return false;
  if (f.rarity !== 'all' && card.rarity !== f.rarity) return false;
  if (f.variant !== 'all') {
    const variant = card.variant ?? 'standard';
    if (variant !== f.variant) return false;
  }
  if (f.forSaleStatus === 'has_for_sale' && !hasForSale) return false;
  if (f.forSaleStatus === 'no_for_sale' && hasForSale) return false;
  return true;
}

export default function StockList({ cards: initial, forSaleKeys, registered }: StockListProps) {
  const router = useRouter();
  const [cards, setCards] = useState<Card[]>(initial);
  const [filters, setFilters] = useState<StockFilterState>(INITIAL_STOCK_FILTERS);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [exchangeModal, setExchangeModal] = useState<{
    newCard: { id: string; cardName: string };
    conflictCard: ExchangeConflictCard;
  } | null>(null);
  const [moveToPokedexCard, setMoveToPokedexCard] = useState<Card | null>(null);

  const groups = useMemo(() => {
    const filtered = cards.filter((c) => {
      const hasForSale = forSaleKeys.has(stockMatchKey(c));
      return matchesSearch(c, filters.search) && matchesFilters(c, filters, hasForSale);
    });
    return groupCards(filtered);
  }, [cards, filters, forSaleKeys]);

  const handleListForSale = async (card: Card) => {
    setBusyKey(groupKey(card));
    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'for_sale' }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
          conflictCard?: ExchangeConflictCard;
        };
        if (res.status === 409 && body.error === 'for_sale_conflict' && body.conflictCard) {
          setExchangeModal({
            newCard: { id: card.id, cardName: card.card_name },
            conflictCard: body.conflictCard,
          });
          return;
        }
        throw new Error(body.message ?? body.error ?? `Mise en vente échouée (${res.status})`);
      }
      setCards((prev) => prev.filter((c) => c.id !== card.id));
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setBusyKey(null);
    }
  };

  const handleIncrement = async (card: Card) => {
    setBusyKey(groupKey(card));
    try {
      const res = await fetch(`/api/cards/${card.id}/clone`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        throw new Error(body.message ?? body.error ?? `Clone échoué (${res.status})`);
      }
      const { card: cloned } = (await res.json()) as { card: Card };
      // Inserting at the end keeps the head (oldest) untouched — the new copy
      // is the freshest, which matches "le plus vieux en premier" sort order.
      setCards((prev) => [...prev, cloned]);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setBusyKey(null);
    }
  };

  const handleDecrement = async (card: Card) => {
    // Remove the freshest copy of the group so the original entry sticks
    // around for history. We re-derive the group from current state to find
    // the right id (the head card passed in is the oldest, not the target).
    const key = groupKey(card);
    const sameGroup = cards
      .filter((c) => groupKey(c) === key)
      .sort((a, b) => a.date_added.localeCompare(b.date_added));
    if (sameGroup.length <= 1) return; // guard — UI also disables the button
    const target = sameGroup[sameGroup.length - 1];

    setBusyKey(key);
    try {
      const res = await fetch(`/api/cards/${target.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        throw new Error(body.message ?? body.error ?? `Suppression échouée (${res.status})`);
      }
      setCards((prev) => prev.filter((c) => c.id !== target.id));
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div>
      <StockFilters
        value={filters}
        onChange={setFilters}
        visibleCards={groups.length}
        totalCards={cards.length}
      />

      {groups.length === 0 ? (
        <div className="bg-surface border-border rounded-lg border p-6">
          <p className="text-text-muted text-sm">
            {cards.length === 0 ? 'Aucune carte en collection.' : 'Aucune carte ne correspond aux filtres.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {groups.map((g) => (
            <StockRow
              key={g.key}
              group={g}
              isRegistered={registered.has(g.head.pokemon_number)}
              hasForSaleSibling={forSaleKeys.has(stockMatchKey(g.head))}
              onListForSaleClick={handleListForSale}
              onMoveToPokedexClick={() => setMoveToPokedexCard(g.head)}
              onIncrement={handleIncrement}
              onDecrement={handleDecrement}
              busy={busyKey === g.key}
            />
          ))}
        </ul>
      )}

      {exchangeModal && (
        <ExchangeOnConflictModal
          newCard={exchangeModal.newCard}
          conflictCard={exchangeModal.conflictCard}
          onClose={() => setExchangeModal(null)}
          onExchanged={() => {
            setCards((prev) => prev.filter((c) => c.id !== exchangeModal.newCard.id));
            setExchangeModal(null);
          }}
        />
      )}

      {moveToPokedexCard && (
        <MoveToPokedexModal
          card={{
            id: moveToPokedexCard.id,
            card_name: moveToPokedexCard.card_name,
            image_url: moveToPokedexCard.image_url,
            tcg_image_url: moveToPokedexCard.tcg_image_url,
          }}
          currentLocation="Stock"
          onClose={() => setMoveToPokedexCard(null)}
          onPromoted={() => {
            const promotedId = moveToPokedexCard.id;
            setCards((prev) => prev.filter((c) => c.id !== promotedId));
            setMoveToPokedexCard(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
