'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Card, Lot, CardWithListings, LotWithListings, BaseListing } from '@/lib/types';
import { groupCards, groupKey, type CardGroup } from '@/lib/utils/group-cards';
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
import PartnerCleanupModal from './PartnerCleanupModal';
import CardZoomModal from './CardZoomModal';
import type { RestockAlert } from '@/lib/utils/restock-detection';
import type { PromoteCandidate } from '@/lib/utils/promote-detection';
import type { VintedConfig } from '@/lib/utils/vinted-template';
import { passesStateChips, shouldHideForSalePile, passesMultiUserChip } from '@/lib/utils/vinted-filter';
import { getMyListing } from '@/lib/utils/listings';
import MoveToPokedexModal from '@/components/cards/MoveToPokedexModal';
import LotRow from '@/components/lots/LotRow';
import LotSoldRow from '@/components/lots/LotSoldRow';
import LotAnnonceModal from '@/components/lots/LotAnnonceModal';
import BulkSelectionBottomBar from './BulkSelectionBottomBar';
import BulkSoldModal, { type BulkSoldItem } from './BulkSoldModal';
import BulkSoldRecapModal from './BulkSoldRecapModal';
import { splitPrice } from '@/lib/utils/split-bulk-price';
import { useUserContext } from '@/lib/hooks/useUserContext';
import { useDataSync } from './hooks/useDataSync';
import { useSelectionMode } from './hooks/useSelectionMode';
import { useStockCount } from './hooks/useStockCount';

export interface VintedListProps {
  cards: CardWithListings[];
  lots: LotWithListings[];
  /** Cards with status='collection' — drives the per-row "× N en stock" chip.
   *  Same group key as the for_sale row tells us how many physical extras
   *  the user has of each Vinted listing. */
  collectionCards: Card[];
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

export default function VintedList({ cards: initial, lots: initialLots, collectionCards: initialCollection, registered, config }: VintedListProps) {
  const router = useRouter();
  const { myUserId, partnerUserId, partnerName } = useUserContext();

  // Data state — see useDataSync for the prop→state re-sync rationale.
  const { cards, setCards, lots, setLots, collectionCards, setCollectionCards } = useDataSync(
    initial,
    initialLots,
    initialCollection,
  );

  const [filters, setFilters] = useState<VintedFilterState>(INITIAL_FILTERS);
  const [now] = useState(() => Date.now());

  const { selectionMode, selectedIds, toggleSelect, toggleSelectionMode, cancelSelection } =
    useSelectionMode();
  const [bulkSoldOpen, setBulkSoldOpen] = useState(false);

  const { stockCountByGroup, stockBusyKeys, handleSetStockCount } = useStockCount(
    collectionCards,
    setCollectionCards,
  );

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
  /**
   * Queued PartnerCleanup notice — set when a sold item HAD a partner listing
   * at sale time. Shown either:
   *   - immediately, if there was no promote candidate (no replacement possible)
   *   - after the user dismisses PromoteAfterSoldModal without promoting
   * Cleared when the user accepts the promote (the new for_sale row replaces
   * the partner's listing semantically) or when they ack the cleanup notice.
   */
  const [partnerCleanup, setPartnerCleanup] = useState<{ itemKind: 'card' | 'lot'; itemDisplayName: string } | null>(null);
  /**
   * Bulk variant of partnerCleanup — drained one-by-one after BulkSoldRecap
   * and the bulk-promote queue both finish.
   */
  const [partnerCleanupQueue, setPartnerCleanupQueue] = useState<Array<{ itemKind: 'card' | 'lot'; itemDisplayName: string }>>([]);
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
    // Capture partner-listing-state at sale time so we can prompt the user
    // to ask the partner to clean up their Vinted listing if no replacement
    // is possible (no promote candidate, or user declines the promote).
    const partnerListed = soldTarget
      ? (soldTarget.kind === 'card'
          ? getPartnerListing((soldTarget.card as CardWithListings).listings ?? [], partnerUserId) !== null
          : getPartnerListing((soldTarget.lot as LotWithListings).listings ?? [], partnerUserId) !== null)
      : false;
    const itemDisplayName = soldTarget
      ? (soldTarget.kind === 'card' ? soldTarget.card.card_name : soldTarget.lot.name)
      : '';

    if (info.kind === 'card') {
      // Mark sold + drop my listing optimistically so inActionPile() returns
      // false and the card immediately moves to the Vendus pile. Without this
      // the row stays in for-sale with the À retirer + Listée par X badges
      // until the user reloads the page.
      setCards((prev) =>
        prev.map((c): CardWithListings =>
          c.id === info.soldId
            ? {
                ...c,
                status: 'sold' as const,
                date_sold: new Date().toISOString(),
                sold_by_user_id: myUserId,
                listings: c.listings.filter((l) => l.user_id !== myUserId),
              }
            : c,
        ),
      );
      if (info.restock) setRestockAlert(info.restock);
      if (info.promote) setPromoteCandidate(info.promote);
    } else {
      // Lot branch: same optimistic listing-prune so the row leaves the
      // for-sale pile right after sold.
      setLots((prev) =>
        prev.map((l): LotWithListings =>
          l.id === info.soldId
            ? {
                ...l,
                status: 'sold' as const,
                date_sold: new Date().toISOString(),
                sold_by_user_id: myUserId,
                listings: l.listings.filter((l2) => l2.user_id !== myUserId),
              }
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

    // Partner cleanup notice — only relevant when partner had a listing.
    // Always queued upfront; the render gate hides it while PromoteAfterSold
    // is open. If the user promotes successfully, handlePromoted clears it
    // (the new for_sale row replaces the partner's listing semantically).
    if (partnerListed) {
      setPartnerCleanup({ itemKind: info.kind, itemDisplayName });
    }
  };

  const handlePromoted = () => {
    setPromoteCandidate(null);
    // Successful promote → the new for_sale row replaces the partner's
    // listing in spirit. No need to nag the user about cleanup.
    setPartnerCleanup(null);
    router.refresh();
  };

  async function handleBulkSold(items: BulkSoldItem[], totalPrice: number, dateSoldIso: string) {
    const prices = splitPrice(totalPrice, items.length);
    const soldItems: BulkSoldItem[] = [];
    const restocks: RestockAlert[] = [];
    const promotes: PromoteCandidate[] = [];
    /** Per-item: did it have a partner listing AT sale time? Lines up by index with `soldItems`. */
    const partnerListedFlags: boolean[] = [];
    let failCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const sold_price = prices[i];
      const id = item.kind === 'card' ? item.card.id : item.lot.id;
      const endpoint = item.kind === 'card' ? `/api/cards/${id}` : `/api/lots/${id}`;
      // Capture partner-listing-state BEFORE the sale (local state still has it).
      const itemListings: BaseListing[] = item.kind === 'card'
        ? ((item.card as CardWithListings).listings ?? [])
        : ((item.lot as LotWithListings).listings ?? []);
      const hadPartnerListing = getPartnerListing(itemListings, partnerUserId) !== null;
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
        partnerListedFlags.push(hadPartnerListing);
        if (item.kind === 'card') {
          setCards((prev) => prev.map((c): CardWithListings => (c.id === id ? { ...c, status: 'sold' as const, sold_price, date_sold: dateSoldIso, sold_by_user_id: myUserId, listings: c.listings.filter((l) => l.user_id !== myUserId) } : c)));
          if (json.restock) restocks.push(json.restock);
          if (json.promote) promotes.push(json.promote);
        } else {
          setLots((prev) => prev.map((l): LotWithListings => (l.id === id ? { ...l, status: 'sold' as const, sold_price, date_sold: dateSoldIso, sold_by_user_id: myUserId, listings: l.listings.filter((l2) => l2.user_id !== myUserId) } : l)));
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

    // Build the partner-cleanup queue: one entry per sold item that HAD a
    // partner listing. The current bulk shape doesn't track which sold item
    // produced which promote candidate, so we queue cleanups for ALL items
    // with partner listings — if the user accepts a related promote, the
    // cleanup modal will still pop up but they can dismiss it (slight
    // over-notification, simpler invariant).
    const cleanupQueue = soldItems
      .map((item, i) => {
        if (!partnerListedFlags[i]) return null;
        return {
          itemKind: item.kind,
          itemDisplayName: item.kind === 'card' ? item.card.card_name : item.lot.name,
        };
      })
      .filter((entry): entry is { itemKind: 'card' | 'lot'; itemDisplayName: string } => entry !== null);
    if (cleanupQueue.length > 0) setPartnerCleanupQueue(cleanupQueue);

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

    // "Pile à actionner" = items the user can still act on:
    //   - status='for_sale' (normal)
    //   - any other status WITH my listing still up — typically:
    //       sold: partner sold it but my listing is still online (cleanup)
    //       pokedex: I moved the card to my Pokédex but my Vinted listing
    //         is still up (cleanup)
    //       collection: card moved back to stock, listing not pruned
    //     All routed via passesStateChips (mine !== null → isOnline)
    //     so the En ligne / À rafraîchir chips work as expected.
    const inActionPile = (c: CardWithListings) =>
      c.status === 'for_sale' || getMyListing(c.listings, myUserId) !== null;
    const forSale = cards.filter(inActionPile);
    // Sold pile excludes items also in the action pile (no double-rendering).
    const sold = cards.filter((c) => c.status === 'sold' && !inActionPile(c));

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
    // Excludes items already in the action pile (sold-with-my-listing-up).
    const soldSubset = !showCards || !filters.showSold
      ? []
      : sold
          .filter(passesCommon)
          .sort((a, b) => (b.date_sold ?? '').localeCompare(a.date_sold ?? ''));

    const sorted = sortVintedGroups(groupCards(finalForSale) as CardGroupWithListings[], now, myUserId).map((g, i) => ({
      ...g,
      position: i + 1,
    }));

    // Lots: same logic as cards. Any non-for_sale status with my listing up
    // belongs to the action pile (À retirer), not the sold pile. Lots only
    // have for_sale | sold (no pokedex/collection), but we keep the same
    // shape for symmetry.
    const lotInActionPile = (l: LotWithListings) =>
      l.status === 'for_sale' || getMyListing(l.listings, myUserId) !== null;

    const forSaleLots = !showLots || shouldHideForSalePile(filters)
      ? []
      : lots.filter(
          (l) =>
            lotInActionPile(l) &&
            matchesLotSearch(l, filters.search) &&
            passesStateChips(getMyListing(l.listings, myUserId), filters, now) &&
            passesMultiUserChip(l as { status: string; listings: BaseListing[] }, filters.multiUserChip, myUserId, partnerUserId),
        );

    const soldLotsList = !showLots || !filters.showSold
      ? []
      : lots
          .filter((l) => l.status === 'sold' && !lotInActionPile(l) && matchesLotSearch(l, filters.search))
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
              isRegistered={g.head.pokemon_number != null && registered.has(g.head.pokemon_number)}
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
              stockCount={stockCountByGroup.get(groupKey(g.head)) ?? 0}
              onSetStockCount={(target) => handleSetStockCount(g.head, target)}
              stockBusy={stockBusyKeys.has(g.key)}
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
            <SoldRow key={c.id} card={c} onAnnonceClick={(card) => setAnnonceTarget(card)} />
          ))}
          {soldLotsList.map((l) => (
            <LotSoldRow
              key={`sold-lot-${l.id}`}
              lot={l}
              storagePublicUrl={storagePublicUrl}
              onImageClick={(lot) => setLotAnnonceTarget(lot)}
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
        return (
          <BulkSoldModal
            items={items}
            onClose={() => setBulkSoldOpen(false)}
            onConfirm={async (totalPrice, dateSoldIso) => {
              await handleBulkSold(items, totalPrice, dateSoldIso);
              setBulkSoldOpen(false);
              cancelSelection();
            }}
          />
        );
      })()}

      {bulkRecap && (
        <BulkSoldRecapModal
          items={bulkRecap.items}
          restocks={bulkRecap.restocks}
          onClose={dismissBulkRecap}
        />
      )}

      {/* Drain bulk-promote queue: shown after the recap modal closes. Each
        decision shifts the queue, exposing the next candidate.
        `key={cardId}` forces React to remount the modal between candidates
        — without it, the same instance is reused and its `submitting`
        useState stays true from the previous successful PATCH, so the
        2nd+ modal shows "Patientez…" forever. */}
      {!bulkRecap && currentBulkPromote && (
        <PromoteAfterSoldModal
          key={currentBulkPromote.cardId}
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
      {/* Partner cleanup — shown only when no PromoteAfterSold is in front of it.
        If a promote was offered and dismissed (not accepted), this falls through. */}
      {partnerCleanup && !promoteCandidate && partnerName && (
        <PartnerCleanupModal
          partnerName={partnerName}
          itemDisplayName={partnerCleanup.itemDisplayName}
          itemKind={partnerCleanup.itemKind}
          onClose={() => setPartnerCleanup(null)}
        />
      )}

      {/* Bulk partner cleanup queue — drained one-by-one AFTER the bulk recap
        and bulk-promote queue both finish. Same modal as the single-item
        flow, surfaced for each unreplaced sold item that had a partner
        listing. */}
      {!bulkRecap && !currentBulkPromote && partnerCleanupQueue.length > 0 && partnerName && (
        <PartnerCleanupModal
          partnerName={partnerName}
          itemDisplayName={partnerCleanupQueue[0].itemDisplayName}
          itemKind={partnerCleanupQueue[0].itemKind}
          onClose={() => setPartnerCleanupQueue((q) => q.slice(1))}
        />
      )}
      {annonceTarget && (
        <AnnonceModal
          card={annonceTarget}
          config={vintedConfig}
          onClose={() => setAnnonceTarget(null)}
          onPriceSaved={(cardId, newPrice) => {
            updateCardPrice(cardId, newPrice);
            // Also re-seed the modal's source state so its display reads the
            // new value without requiring a close/reopen. Without this, the
            // list refreshes but the modal still shows the stale prop.
            setAnnonceTarget((prev) => (prev && prev.id === cardId ? { ...prev, suggested_price: newPrice } : prev));
          }}
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
          onPriceSaved={(lotId, newPrice) => {
            updateLotPrice(lotId, newPrice);
            // Same as the card modal: keep the modal's source state in sync
            // with the list update so the new price is visible immediately.
            setLotAnnonceTarget((prev) => (prev && prev.id === lotId ? { ...prev, price: newPrice } : prev));
          }}
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
