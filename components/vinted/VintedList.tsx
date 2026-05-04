// components/vinted/VintedList.tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Card, Lot, CardWithListings, LotWithListings, BaseListing } from '@/lib/types';
import { groupCards, type CardGroup } from '@/lib/utils/group-cards';
import { sortVintedGroups } from '@/lib/utils/vinted-sort';
import { getPartnerListing } from '@/lib/utils/listings';
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
import { passesStateChips, shouldHideForSalePile, passesMultiUserChip } from '@/lib/utils/vinted-filter';
import { getMyListing } from '@/lib/utils/listings';
import MoveToPokedexModal from '@/components/cards/MoveToPokedexModal';
import LotRow from '@/components/lots/LotRow';
import LotAnnonceModal from '@/components/lots/LotAnnonceModal';
import BulkSelectionBottomBar from './BulkSelectionBottomBar';
import BulkSoldModal, { type BulkSoldItem } from './BulkSoldModal';
import BulkSoldRecapModal from './BulkSoldRecapModal';
import { splitPrice } from '@/lib/utils/split-bulk-price';
import { useUserContext } from '@/lib/hooks/useUserContext';

export interface VintedListProps {
  cards: CardWithListings[];
  lots: LotWithListings[];
  registered: Set<number>;
  config: Record<string, string>;
}

/** Type helper: CardGroup with CardWithListings instead of Card. */
type CardGroupWithListings = Omit<CardGroup, 'head' | 'cards'> & {
  head: CardWithListings;
  cards: CardWithListings[];
  position?: number;
};

function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function matchesSearch(card: CardWithListings, query: string): boolean {
  if (!query) return true;
  const q = normalize(query);
  const fields = [
    card.set_number, card.card_name, card.pokemon_name,
    card.set_name, card.set_code, card.language, card.rarity,
  ];
  return fields.some((f) => f && normalize(f).includes(q));
}

function matchesLotSearch(lot: LotWithListings, query: string): boolean {
  if (!query) return true;
  const q = normalize(query);
  const fields = [lot.name, lot.extra_description ?? '', lot.language ?? ''];
  return fields.some((f) => f && normalize(f).includes(q));
}

function matchesAttrFilters(card: CardWithListings, f: VintedFilterState): boolean {
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
  const { myUserId, partnerUserId, partnerName } = useUserContext();
  const [cards, setCards] = useState<CardWithListings[]>(initial);
  const [lots, setLots] = useState<LotWithListings[]>(initialLots);
  const [filters, setFilters] = useState<VintedFilterState>(INITIAL_FILTERS);
  const [now] = useState(() => Date.now());
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSoldOpen, setBulkSoldOpen] = useState(false);

  const storagePublicUrl = (path: string) =>
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/lot-photos/${path}`;

  const updateCardPrice = (cardId: string, newPrice: number | null) => {
    setCards((prev) => prev.map((c): CardWithListings => (c.id === cardId ? { ...c, suggested_price: newPrice } : c)));
  };

  const updateLotPrice = (lotId: string, newPrice: number | null) => {
    setLots((prev) => prev.map((l): LotWithListings => (l.id === lotId ? { ...l, price: newPrice } : l)));
  };

  const onListingsChanged = () => router.refresh();

  const [soldTarget, setSoldTarget] = useState<SoldEntity | null>(null);
  const [restockAlert, setRestockAlert] = useState<RestockAlert | null>(null);
  const [promoteCandidate, setPromoteCandidate] = useState<PromoteCandidate | null>(null);
  const [bulkRecap, setBulkRecap] = useState<{
    items: BulkSoldItem[];
    restocks: RestockAlert[];
    promotes: PromoteCandidate[];
  } | null>(null);
  /** Promote candidates from a bulk-sold batch, drained one-by-one after the recap modal closes. */
  const [bulkPromoteQueue, setBulkPromoteQueue] = useState<PromoteCandidate[]>([]);
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
        prev.map((c): CardWithListings =>
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
        prev.map((l): LotWithListings =>
          l.id === info.soldId
            ? { ...l, status: 'sold' as const, date_sold: new Date().toISOString() }
            : l,
        ),
      );
    }
    setSoldTarget(null);
    // Side-effect: DELETE my listing after sale
    const kind = info.kind === 'card' ? 'card' : 'lot';
    fetch(`/api/listings/${kind}/${info.soldId}`, { method: 'DELETE' }).catch(() => {
      // Silent — RLS allows me to delete only my own listings, error is non-fatal.
    });
  };

  const handlePromoted = () => {
    setPromoteCandidate(null);
    router.refresh();
  };

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectionMode() {
    setSelectionMode((m) => {
      if (m) {
        // Exiting selection mode → clear selection
        setSelectedIds(new Set());
      }
      return !m;
    });
  }

  function cancelSelection() {
    setSelectedIds(new Set());
    setSelectionMode(false);
  }

  async function handleBulkSold(items: BulkSoldItem[], totalPrice: number, dateSoldIso: string) {
    const prices = splitPrice(totalPrice, items.length);
    const soldItems: BulkSoldItem[] = [];
    const restocks: RestockAlert[] = [];
    const promotes: PromoteCandidate[] = [];
    let failCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const sold_price = prices[i];
      const id = item.kind === 'card' ? item.card.id : item.lot.id;
      const endpoint = item.kind === 'card' ? `/api/cards/${id}` : `/api/lots/${id}`;
      try {
        const res = await fetch(endpoint, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            status: 'sold',
            sold_price,
            date_sold: dateSoldIso,
          }),
        });
        const json = (await res.json()) as {
          error?: string;
          restock?: RestockAlert | null;
          promote?: PromoteCandidate | null;
        };
        if (!res.ok) {
          failCount += 1;
          errors.push(`${item.kind === 'card' ? item.card.card_name : item.lot.name}: ${json.error ?? 'erreur'}`);
          continue;
        }
        soldItems.push(item);
        if (item.kind === 'card') {
          setCards((prev) => prev.map((c): CardWithListings => (c.id === id ? { ...c, status: 'sold' as const, sold_price, date_sold: dateSoldIso } : c)));
          if (json.restock) restocks.push(json.restock);
          if (json.promote) promotes.push(json.promote);
        } else {
          setLots((prev) => prev.map((l): LotWithListings => (l.id === id ? { ...l, status: 'sold' as const, sold_price, date_sold: dateSoldIso } : l)));
        }
        // Side-effect: DELETE my listing after sale
        const kind = item.kind === 'card' ? 'card' : 'lot';
        fetch(`/api/listings/${kind}/${id}`, { method: 'DELETE' }).catch(() => {
          // Silent — best-effort
        });
      } catch (e) {
        failCount += 1;
        errors.push(`${item.kind === 'card' ? item.card.card_name : item.lot.name}: ${e instanceof Error ? e.message : 'network'}`);
      }
    }

    if (failCount > 0) {
      console.warn(`[bulk-sold] ${soldItems.length} vendus, ${failCount} échec(s)`, errors);
    } else {
      console.log(`[bulk-sold] ${soldItems.length} vendus`);
    }

    if (soldItems.length > 0) {
      setBulkRecap({ items: soldItems, restocks, promotes });
    } else if (failCount > 0) {
      // No success at all — surface errors directly since the recap modal won't open.
      alert(`Aucune vente enregistrée. ${failCount} échec(s) :\n\n${errors.join('\n')}`);
    }
  }

  // After the bulk recap modal closes, drain the promote queue one-by-one. The
  // existing <PromoteAfterSoldModal> handles each candidate; on close/promote
  // we shift the queue so the next render shows the next one.
  function dismissBulkRecap() {
    if (!bulkRecap) return;
    const queue = [...bulkRecap.promotes];
    setBulkRecap(null);
    setBulkPromoteQueue(queue);
  }

  function shiftBulkPromoteQueue() {
    setBulkPromoteQueue((q) => q.slice(1));
  }

  const currentBulkPromote = bulkPromoteQueue[0] ?? null;

  const { groups, soldRows, forSaleLots, soldLotsList, totalVisible } = useMemo(() => {
    const showCards = filters.kindFilter !== 'lots';
    const showLots = filters.kindFilter !== 'cards';

    const forSale = cards.filter((c) => c.status === 'for_sale');
    const sold = cards.filter((c) => c.status === 'sold');

    // Common: search + attribute filters apply to every pile.
    const passesCommon = (c: CardWithListings) =>
      matchesSearch(c, filters.search) && matchesAttrFilters(c, filters);

    // The state chips (En ligne / Pas en ligne / À rafraîchir) combine
    // additively — see lib/utils/vinted-filter.ts for the rules. Using the
    // shared helper keeps the UI semantics in lockstep with the test suite.
    const finalForSale = !showCards || shouldHideForSalePile(filters)
      ? []
      : forSale.filter((c) => passesCommon(c) && passesStateChips(getMyListing(c.listings, myUserId), filters, now) && passesMultiUserChip(c as { status: string; listings: BaseListing[] }, filters.multiUserChip, myUserId, partnerUserId));

    // Sold pile is independent: included only when the Vendus chip is on.
    const soldSubset = !showCards || !filters.showSold
      ? []
      : sold
          .filter(passesCommon)
          .sort((a, b) => (b.date_sold ?? '').localeCompare(a.date_sold ?? ''));

    const sorted = sortVintedGroups(groupCards(finalForSale) as CardGroupWithListings[], now, myUserId).map((g, i) => ({
      ...g,
      position: i + 1,
    }));

    // Lots: no grouping, each lot is unique. Apply search filter to lot name +
    // extra_description AND state chips (En ligne / Pas en ligne / À rafraîchir
    // / Vendus). Lots have listings just like cards.
    const forSaleLots = !showLots || shouldHideForSalePile(filters)
      ? []
      : lots.filter(
          (l) =>
            l.status === 'for_sale' &&
            matchesLotSearch(l, filters.search) &&
            passesStateChips(getMyListing(l.listings, myUserId), filters, now) &&
            passesMultiUserChip(l as { status: string; listings: BaseListing[] }, filters.multiUserChip, myUserId, partnerUserId),
        );

    const soldLotsList = !showLots || !filters.showSold
      ? []
      : lots
          .filter((l) => l.status === 'sold' && matchesLotSearch(l, filters.search))
          .sort((a, b) => (b.date_sold ?? '').localeCompare(a.date_sold ?? ''));

    return {
      groups: sorted,
      soldRows: soldSubset,
      forSaleLots,
      soldLotsList,
      totalVisible: finalForSale.length + soldSubset.length + forSaleLots.length + soldLotsList.length,
    };
  }, [cards, lots, filters, now, myUserId, partnerUserId]);

  const isEmpty = groups.length === 0 && soldRows.length === 0 && forSaleLots.length === 0 && soldLotsList.length === 0;

  return (
    <div>
      <VintedFilters
        value={filters}
        onChange={setFilters}
        visibleCards={totalVisible}
        totalCards={cards.length}
        selectionMode={selectionMode}
        onToggleSelectionMode={toggleSelectionMode}
        hasPartner={partnerUserId !== null}
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
              listings={g.head.listings ?? []}
              myUserId={myUserId}
              partnerUserId={partnerUserId}
              partnerName={partnerName}
              onListingsChanged={onListingsChanged}
              onImageClick={() => setZoomCard(g.head)}
              onMoveToPokedexClick={() => setMoveToPokedexCard(g.head)}
              selectionMode={selectionMode}
              selected={selectedIds.has(g.head.id)}
              onToggleSelect={() => toggleSelect(g.head.id)}
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
              listings={l.listings ?? []}
              myUserId={myUserId}
              partnerUserId={partnerUserId}
              partnerName={partnerName}
              onListingsChanged={onListingsChanged}
              selectionMode={selectionMode}
              selected={selectedIds.has(l.id)}
              onToggleSelect={() => toggleSelect(l.id)}
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
              listings={l.listings ?? []}
              myUserId={myUserId}
              partnerUserId={partnerUserId}
              partnerName={partnerName}
              onListingsChanged={onListingsChanged}
            />
          ))}
        </ul>
      )}

      {selectionMode && (() => {
        const selectedCards = cards.filter((c) => c.status === 'for_sale' && selectedIds.has(c.id));
        const selectedLots = lots.filter((l) => l.status === 'for_sale' && selectedIds.has(l.id));
        return (
          <BulkSelectionBottomBar
            cardCount={selectedCards.length}
            lotCount={selectedLots.length}
            onCancel={cancelSelection}
            onConfirm={() => setBulkSoldOpen(true)}
          />
        );
      })()}

      {bulkSoldOpen && (() => {
        const selectedCards = cards.filter((c) => c.status === 'for_sale' && selectedIds.has(c.id));
        const selectedLots = lots.filter((l) => l.status === 'for_sale' && selectedIds.has(l.id));
        const items: BulkSoldItem[] = [
          ...selectedCards.map((c) => ({ kind: 'card' as const, card: c })),
          ...selectedLots.map((l) => ({ kind: 'lot' as const, lot: l })),
        ];
        const partnerListedItems: Array<{ name: string }> = [
          ...selectedCards
            .filter((c) => getPartnerListing(c.listings, partnerUserId))
            .map((c) => ({ name: c.card_name })),
          ...selectedLots
            .filter((l) => getPartnerListing(l.listings, partnerUserId))
            .map((l) => ({ name: l.name })),
        ];
        return (
          <BulkSoldModal
            items={items}
            onClose={() => setBulkSoldOpen(false)}
            onConfirm={async (totalPrice, dateSoldIso) => {
              await handleBulkSold(items, totalPrice, dateSoldIso);
              setBulkSoldOpen(false);
              cancelSelection();
            }}
            partnerName={partnerName}
            partnerListedItems={partnerListedItems}
          />
        );
      })()}

      {bulkRecap && (() => {
        // Build partner-listed items from the recap items (which come from selectedCards/selectedLots, preserving listings at runtime)
        const partnerListedItems: Array<{ name: string }> = bulkRecap.items
          .map((it) => {
            // Runtime: card/lot have listings because they came from CardWithListings/LotWithListings
            if (it.kind === 'card') {
              const listings = (it.card as CardWithListings).listings ?? [];
              if (getPartnerListing(listings, partnerUserId)) return { name: it.card.card_name };
            } else {
              const listings = (it.lot as LotWithListings).listings ?? [];
              if (getPartnerListing(listings, partnerUserId)) return { name: it.lot.name };
            }
            return null;
          })
          .filter((x): x is { name: string } => x !== null);
        return (
          <BulkSoldRecapModal
            items={bulkRecap.items}
            restocks={bulkRecap.restocks}
            onClose={dismissBulkRecap}
            partnerName={partnerName}
            partnerListedItems={partnerListedItems}
          />
        );
      })()}

      {/* Drain bulk-promote queue: shown after the recap modal closes. Each
        decision shifts the queue, exposing the next candidate. */}
      {!bulkRecap && currentBulkPromote && (
        <PromoteAfterSoldModal
          candidate={currentBulkPromote}
          onClose={shiftBulkPromoteQueue}
          onPromoted={() => {
            shiftBulkPromoteQueue();
            router.refresh();
          }}
        />
      )}

      {soldTarget && (
        <SoldModal
          entity={soldTarget}
          onClose={() => setSoldTarget(null)}
          onSold={handleSold}
          partnerListing={
            soldTarget.kind === 'card'
              ? getPartnerListing((soldTarget.card as CardWithListings).listings ?? [], partnerUserId)
              : getPartnerListing((soldTarget.lot as LotWithListings).listings ?? [], partnerUserId)
          }
          partnerName={partnerName}
        />
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
            setCards((prev) => prev.map((c): CardWithListings => (c.id === updated.id ? { ...updated, listings: c.listings } : c)));
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
            setCards((prev) => prev.filter((c) => c.id !== promotedId) as CardWithListings[]);
            setMoveToPokedexCard(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
