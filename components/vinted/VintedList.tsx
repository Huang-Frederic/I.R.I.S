// components/vinted/VintedList.tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Card, Lot } from '@/lib/types';
import { groupCards } from '@/lib/utils/group-cards';
import { sortVintedGroups } from '@/lib/utils/vinted-sort';
import VintedFilters, { INITIAL_FILTERS, type VintedFilterState } from './VintedFilters';
import VintedRow from './VintedRow';
import SoldRow from './SoldRow';
import EditablePriceCell from './EditablePriceCell';
import SoldModal, { type SoldEntity } from './SoldModal';
import RestockToast from './RestockToast';
import AnnonceModal from './AnnonceModal';
import PromoteAfterSoldModal from './PromoteAfterSoldModal';
import CardZoomModal from './CardZoomModal';
import type { RestockAlert } from '@/lib/utils/restock-detection';
import type { PromoteCandidate } from '@/lib/utils/promote-detection';
import type { VintedConfig } from '@/lib/utils/vinted-template';
import { passesStateChips, shouldHideForSalePile } from '@/lib/utils/vinted-filter';
import MoveToPokedexModal from '@/components/cards/MoveToPokedexModal';
import LotRow from '@/components/lots/LotRow';
import LotAnnonceModal from '@/components/lots/LotAnnonceModal';

export interface VintedListProps {
  cards: Card[];
  lots: Lot[];
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

function matchesAttrFilters(card: Card, f: VintedFilterState): boolean {
  if (f.language !== 'all' && card.language !== f.language) return false;
  if (f.rarity !== 'all' && card.rarity !== f.rarity) return false;
  if (f.variant !== 'all') {
    const variant = card.variant ?? 'standard';
    if (variant !== f.variant) return false;
  }
  return true;
}

export default function VintedList({ cards: initial, lots: initialLots, registered, config }: VintedListProps) {
  const router = useRouter();
  const [cards, setCards] = useState<Card[]>(initial);
  const [lots, setLots] = useState<Lot[]>(initialLots);
  const [filters, setFilters] = useState<VintedFilterState>(INITIAL_FILTERS);
  const [now] = useState(() => Date.now());

  const storagePublicUrl = (path: string) =>
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/lot-photos/${path}`;

  const updateCardPrice = (cardId: string, newPrice: number | null) => {
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, suggested_price: newPrice } : c)));
  };

  const updateCardListed = (cardId: string, listedAt: string | null) => {
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, vinted_listed_at: listedAt } : c)));
  };

  const updateLotPrice = (lotId: string, newPrice: number | null) => {
    setLots((prev) => prev.map((l) => (l.id === lotId ? { ...l, price: newPrice } : l)));
  };

  const updateLotListed = (lotId: string, listedAt: string | null) => {
    setLots((prev) => prev.map((l) => (l.id === lotId ? { ...l, vinted_listed_at: listedAt } : l)));
  };

  const [soldTarget, setSoldTarget] = useState<SoldEntity | null>(null);
  const [restockAlert, setRestockAlert] = useState<RestockAlert | null>(null);
  const [promoteCandidate, setPromoteCandidate] = useState<PromoteCandidate | null>(null);
  const [annonceTarget, setAnnonceTarget] = useState<Card | null>(null);
  const [lotAnnonceTarget, setLotAnnonceTarget] = useState<Lot | null>(null);
  const [zoomCard, setZoomCard] = useState<Card | null>(null);
  const [moveToPokedexCard, setMoveToPokedexCard] = useState<Card | null>(null);

  const vintedConfig: VintedConfig = {
    vinted_shipping_note: config.vinted_shipping_note ?? '',
    vinted_seller_note: config.vinted_seller_note ?? '',
  };

  function cardImageUrl(card: Card): string {
    if (card.image_url) return card.image_url;
    if (card.tcg_image_url) return card.tcg_image_url;
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${card.pokemon_number}.png`;
  }

  const handleSold = (info: {
    soldId: string;
    kind: 'card' | 'lot';
    restock: RestockAlert | null;
    promote: PromoteCandidate | null;
  }) => {
    if (info.kind === 'card') {
      // Mark the card as sold in local state instead of removing it (so it shows up under Vendus filter).
      setCards((prev) =>
        prev.map((c) =>
          c.id === info.soldId
            ? { ...c, status: 'sold' as const, date_sold: new Date().toISOString() }
            : c,
        ),
      );
      if (info.restock) setRestockAlert(info.restock);
      if (info.promote) setPromoteCandidate(info.promote);
    } else {
      // Lot branch: mark the lot as sold in local state (so it appears under Vendus filter).
      setLots((prev) =>
        prev.map((l) =>
          l.id === info.soldId
            ? { ...l, status: 'sold' as const, date_sold: new Date().toISOString() }
            : l,
        ),
      );
    }
    setSoldTarget(null);
  };

  const handlePromoted = () => {
    setPromoteCandidate(null);
    router.refresh();
  };

  const { groups, soldRows, forSaleLots, soldLotsList, totalVisible } = useMemo(() => {
    const showCards = filters.kindFilter !== 'lots';
    const showLots = filters.kindFilter !== 'cards';

    const forSale = cards.filter((c) => c.status === 'for_sale');
    const sold = cards.filter((c) => c.status === 'sold');

    // Common: search + attribute filters apply to every pile.
    const passesCommon = (c: Card) =>
      matchesSearch(c, filters.search) && matchesAttrFilters(c, filters);

    // The state chips (En ligne / Pas en ligne / À rafraîchir) combine
    // additively — see lib/utils/vinted-filter.ts for the rules. Using the
    // shared helper keeps the UI semantics in lockstep with the test suite.
    const finalForSale = !showCards || shouldHideForSalePile(filters)
      ? []
      : forSale.filter((c) => passesCommon(c) && passesStateChips(c, filters, now));

    // Sold pile is independent: included only when the Vendus chip is on.
    const soldSubset = !showCards || !filters.showSold
      ? []
      : sold
          .filter(passesCommon)
          .sort((a, b) => (b.date_sold ?? '').localeCompare(a.date_sold ?? ''));

    const sorted = sortVintedGroups(groupCards(finalForSale), now).map((g, i) => ({
      ...g,
      position: i + 1,
    }));

    // Lots: no grouping, each lot is unique. For Phase 3b1, we don't apply card-specific filters
    // (search, language, rarity, etc.) to lots since they don't have those fields.
    // Future enhancement: simple text search on lot.name.
    const forSaleLots = !showLots
      ? []
      : lots.filter((l) => l.status === 'for_sale');

    const soldLotsList = !showLots || !filters.showSold
      ? []
      : lots
          .filter((l) => l.status === 'sold')
          .sort((a, b) => (b.date_sold ?? '').localeCompare(a.date_sold ?? ''));

    return {
      groups: sorted,
      soldRows: soldSubset,
      forSaleLots,
      soldLotsList,
      totalVisible: finalForSale.length + soldSubset.length + forSaleLots.length + soldLotsList.length,
    };
  }, [cards, lots, filters, now]);

  const isEmpty = groups.length === 0 && soldRows.length === 0 && forSaleLots.length === 0 && soldLotsList.length === 0;

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
              onSoldClick={() => setSoldTarget({ kind: 'card', card: g.head })}
              onListedToggled={updateCardListed}
              onImageClick={() => setZoomCard(g.head)}
              onMoveToPokedexClick={() => setMoveToPokedexCard(g.head)}
            />
          ))}
          {forSaleLots.map((l) => (
            <LotRow
              key={`lot-${l.id}`}
              lot={l}
              storagePublicUrl={storagePublicUrl}
              onAnnonceClick={(lot) => setLotAnnonceTarget(lot)}
              onSoldClick={(lot) => setSoldTarget({ kind: 'lot', lot })}
              onPriceSaved={updateLotPrice}
              onListedToggled={updateLotListed}
            />
          ))}
          {soldRows.map((c) => (
            <SoldRow key={c.id} card={c} />
          ))}
          {soldLotsList.map((l) => (
            <LotRow
              key={`sold-lot-${l.id}`}
              lot={l}
              storagePublicUrl={storagePublicUrl}
              onAnnonceClick={(lot) => setLotAnnonceTarget(lot)}
              onSoldClick={() => {
                /* already sold */
              }}
              onPriceSaved={updateLotPrice}
              onListedToggled={updateLotListed}
            />
          ))}
        </ul>
      )}

      {soldTarget && (
        <SoldModal entity={soldTarget} onClose={() => setSoldTarget(null)} onSold={handleSold} />
      )}
      {restockAlert && <RestockToast alert={restockAlert} onDismiss={() => setRestockAlert(null)} />}
      {promoteCandidate && (
        <PromoteAfterSoldModal
          candidate={promoteCandidate}
          onClose={() => setPromoteCandidate(null)}
          onPromoted={handlePromoted}
        />
      )}
      {annonceTarget && (
        <AnnonceModal
          card={annonceTarget}
          config={vintedConfig}
          onClose={() => setAnnonceTarget(null)}
          onPriceSaved={updateCardPrice}
          onCardRefreshed={(updated) => {
            setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
            setAnnonceTarget(updated);
          }}
        />
      )}
      {lotAnnonceTarget && (
        <LotAnnonceModal
          lot={lotAnnonceTarget}
          storagePublicUrl={storagePublicUrl}
          onClose={() => setLotAnnonceTarget(null)}
          onPriceSaved={updateLotPrice}
        />
      )}
      {zoomCard && (
        <CardZoomModal
          src={cardImageUrl(zoomCard)}
          alt={zoomCard.card_name}
          onClose={() => setZoomCard(null)}
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
          currentLocation="Vinted"
          onClose={() => setMoveToPokedexCard(null)}
          onPromoted={() => {
            // The card has left for_sale → drop it from local state and refresh
            // so the Pokédex slot reflects the change.
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
