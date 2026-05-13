'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { Card } from '@/lib/types';
import { groupCards, groupKey, type CardGroup } from '@/lib/utils/group-cards';
import { displayCardName } from '@/lib/utils/format-name';
import StockFilters, { INITIAL_STOCK_FILTERS, type StockFilterState } from './StockFilters';
import StockRow from './StockRow';
import ExchangeOnConflictModal, { type ExchangeConflictCard } from '@/components/vinted/ExchangeOnConflictModal';
import MoveToPokedexModal from '@/components/cards/MoveToPokedexModal';
import { PriceTrendsProvider } from '@/components/ui/PriceTrendsProvider';
import { PriceDetailModal } from '@/components/price/PriceDetailModal';
import { normalizeForSearch } from '@/lib/utils/text-normalize';
import { translateErrorCode } from '@/lib/utils/translate-error';

export interface StockListProps {
  cards: Card[];
  forSaleKeys: Set<string>;
  /** pokemon_number set for cards already in the Pokédex. Drives the badge. */
  registered: Set<number>;
}

function matchesSearch(card: Card, query: string): boolean {
  if (!query) return true;
  const q = normalizeForSearch(query);
  const fields = [
    card.set_number, card.card_name, card.pokemon_name,
    card.set_name, card.set_code, card.language, card.rarity,
  ];
  return fields.some((f) => f && normalizeForSearch(f).includes(q));
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
  const t = useTranslations('stock');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const router = useRouter();
  const [cards, setCards] = useState<Card[]>(initial);
  // Re-sync local state when SSR re-fetches push new props (after a tab nav
  // refresh or a mutation followed by router.refresh()). Without this, the
  // useState initial value stays frozen and the UI doesn't reflect new rows.
  // The setState-in-effect cascade fires once per refetch — explicit goal.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setCards(initial); }, [initial]);
  const [filters, setFilters] = useState<StockFilterState>(INITIAL_STOCK_FILTERS);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [exchangeModal, setExchangeModal] = useState<{
    newCard: { id: string; cardName: string };
    conflictCard: ExchangeConflictCard;
  } | null>(null);
  const [moveToPokedexCard, setMoveToPokedexCard] = useState<Card | null>(null);
  const [priceModalCard, setPriceModalCard] = useState<Card | null>(null);

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
            newCard: { id: card.id, cardName: displayCardName(card) },
            conflictCard: body.conflictCard,
          });
          return;
        }
        const localized = translateErrorCode(tErrors, body.error);
        throw new Error(localized ?? body.message ?? t('listForSaleFailed', { status: res.status }));
      }
      setCards((prev) => prev.filter((c) => c.id !== card.id));
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : tCommon('errorUnknown'));
    } finally {
      setBusyKey(null);
    }
  };

  const handleSetCount = async (group: CardGroup, target: number) => {
    if (target < 0) return; // negative not allowed; 0 = wipe (StockRow confirms)
    const diff = target - group.count;
    if (diff === 0) return;
    setBusyKey(group.key);
    try {
      if (diff > 0) {
        // Clone N times in parallel — the API handles each as an independent
        // INSERT, so order doesn't matter.
        const sourceId = group.head.id;
        const results = await Promise.all(
          Array.from({ length: diff }, async () => {
            const res = await fetch(`/api/cards/${sourceId}/clone`, { method: 'POST' });
            if (!res.ok) {
              const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
              const localized = translateErrorCode(tErrors, body.error);
              throw new Error(localized ?? body.message ?? t('cloneFailed', { status: res.status }));
            }
            return ((await res.json()) as { card: Card }).card;
          }),
        );
        setCards((prev) => [...prev, ...results]);
      } else {
        // Drop the |diff| FRESHEST copies — preserves the original/head entry.
        const sorted = [...group.cards].sort((a, b) =>
          a.date_added.localeCompare(b.date_added),
        );
        const toDelete = sorted.slice(target); // everything past the target slot
        await Promise.all(
          toDelete.map(async (c) => {
            const res = await fetch(`/api/cards/${c.id}`, { method: 'DELETE' });
            if (!res.ok) {
              const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
              const localized = translateErrorCode(tErrors, body.error);
              throw new Error(localized ?? body.message ?? t('deleteFailed', { status: res.status }));
            }
          }),
        );
        const dropped = new Set(toDelete.map((c) => c.id));
        setCards((prev) => prev.filter((c) => !dropped.has(c.id)));
      }
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : tCommon('errorUnknown'));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <PriceTrendsProvider>
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
              {cards.length === 0 ? t('emptyEmpty') : t('emptyFiltered')}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {groups.map((g) => (
              <StockRow
                key={g.key}
                group={g}
                isRegistered={g.head.pokemon_number != null && registered.has(g.head.pokemon_number)}
                hasForSaleSibling={forSaleKeys.has(stockMatchKey(g.head))}
                onListForSaleClick={handleListForSale}
                onMoveToPokedexClick={() => setMoveToPokedexCard(g.head)}
                onOpenPriceModal={() => setPriceModalCard(g.head)}
                onSetCount={handleSetCount}
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

        {priceModalCard && (
          <PriceDetailModal
            card={priceModalCard}
            open={true}
            onClose={() => setPriceModalCard(null)}
            onCardUpdated={(updated) => setPriceModalCard(updated)}
          />
        )}
      </div>
    </PriceTrendsProvider>
  );
}
