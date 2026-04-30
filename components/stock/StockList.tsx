'use client';

import { useMemo, useState } from 'react';
import type { Card } from '@/lib/types';
import StockFilters, { INITIAL_STOCK_FILTERS, type StockFilterState } from './StockFilters';
import StockRow from './StockRow';
import ExchangeOnConflictModal, { type ExchangeConflictCard } from '@/components/vinted/ExchangeOnConflictModal';

export interface StockListProps {
  cards: Card[];
  forSaleKeys: Set<string>;
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

function makeKey(card: Card): string {
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

export default function StockList({ cards: initial, forSaleKeys }: StockListProps) {
  const [cards, setCards] = useState<Card[]>(initial);
  const [filters, setFilters] = useState<StockFilterState>(INITIAL_STOCK_FILTERS);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [exchangeModal, setExchangeModal] = useState<{
    newCard: { id: string; cardName: string };
    conflictCard: ExchangeConflictCard;
  } | null>(null);

  const filtered = useMemo(
    () =>
      cards.filter((c) => {
        const hasForSale = forSaleKeys.has(makeKey(c));
        return matchesSearch(c, filters.search) && matchesFilters(c, filters, hasForSale);
      }),
    [cards, filters, forSaleKeys],
  );

  const handleListForSale = async (card: Card) => {
    setBusyId(card.id);
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
      // Optimistic remove from local state
      setCards((prev) => prev.filter((c) => c.id !== card.id));
    } catch (err) {
      // Best-effort: log + browser-native alert (no toast infra yet)
      console.error(err);
      alert(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <StockFilters
        value={filters}
        onChange={setFilters}
        visibleCards={filtered.length}
        totalCards={cards.length}
      />

      {filtered.length === 0 ? (
        <div className="bg-surface border-border rounded-lg border p-6">
          <p className="text-text-muted text-sm">
            {cards.length === 0 ? 'Aucune carte en collection.' : 'Aucune carte ne correspond aux filtres.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((c) => (
            <StockRow
              key={c.id}
              card={c}
              hasForSaleSibling={forSaleKeys.has(makeKey(c))}
              onListForSaleClick={handleListForSale}
              busy={busyId === c.id}
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
            // Best-effort: remove the just-promoted card from the local Stock state.
            // The displaced for_sale card now goes to collection (will reappear on refresh) or sold (gone).
            setCards((prev) => prev.filter((c) => c.id !== exchangeModal.newCard.id));
            setExchangeModal(null);
          }}
        />
      )}
    </div>
  );
}
