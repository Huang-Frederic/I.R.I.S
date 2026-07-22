'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { Card, Lot, CardWithListings, LotWithListings, BaseListing } from '@/lib/types';
import { groupCards, groupKey } from '@/lib/utils/group-cards';
import { interleaveCardsAndLots, type MixedRow, type CardGroupWithListings } from '@/lib/utils/vinted-interleave';
import { getPartnerListing } from '@/lib/utils/listings';
import VintedFilters, { INITIAL_FILTERS, type VintedFilterState } from './VintedFilters';
import VintedRow from './VintedRow';
import SoldRow from './SoldRow';
import TradedRow from './TradedRow';
import EditablePriceCell from './EditablePriceCell';
import SoldModal, { type SoldEntity } from './SoldModal';
import RestockToast from './RestockToast';
import AnnonceModal from './AnnonceModal';
import PromoteAfterSoldModal from './PromoteAfterSoldModal';
import BulkPromoteModal from './BulkPromoteModal';
import PartnerCleanupModal from './PartnerCleanupModal';
import CardZoomModal from './CardZoomModal';
import type { RestockAlert } from '@/lib/utils/restock-detection';
import type { PromoteCandidate } from '@/lib/utils/promote-detection';
import type { VintedConfig } from '@/lib/utils/vinted-template';
import { passesStateChips, shouldHideForSalePile, passesMultiUserChip } from '@/lib/utils/vinted-filter';
import { getMyListing } from '@/lib/utils/listings';
import MoveToPokedexModal from '@/components/cards/MoveToPokedexModal';
import PokedexCompareModal, { type PokedexCompareModalCard } from '@/components/cards/PokedexCompareModal';
import { createClient } from '@/lib/supabase/client';
import LotRow from '@/components/lots/LotRow';
import LotSoldRow from '@/components/lots/LotSoldRow';
import LotAnnonceModal from '@/components/lots/LotAnnonceModal';
import BulkSelectionBottomBar from './BulkSelectionBottomBar';
import BulkSoldModal, { type BulkSoldItem } from './BulkSoldModal';
import BulkSoldRecapModal from './BulkSoldRecapModal';
import BulkTradeModal from './BulkTradeModal';
import TradeRecapModal from './TradeRecapModal';
import PushBumpSentModal from './PushBumpSentModal';
import { splitPrice } from '@/lib/utils/split-bulk-price';
import { uploadTradePhoto } from '@/lib/utils/trade-photo';
import { translateErrorCode } from '@/lib/utils/translate-error';
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
  /** When true, the current user is the designated Vinted user and the
   *  "Post to Vinted" button is shown in each row. */
  vintedEnabled: boolean;
}

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

const CATALOG_SINGLE = 4875;
const BRAND_IDS = { pokemon: 191646, onepiece: 89766, magic: 399547, lorcana: 287189, riftbound: 509120 } as const;

function matchesLotFilters(lot: LotWithListings, f: VintedFilterState): boolean {
  if (f.kindFilter === 'single' && lot.catalog_id !== CATALOG_SINGLE) return false;
  if (f.kindFilter === 'lot' && lot.catalog_id === CATALOG_SINGLE) return false;
  if (f.lotBrand !== 'all') {
    const bid = lot.brand_id;
    switch (f.lotBrand) {
      case 'pokemon': if (bid !== null && bid !== BRAND_IDS.pokemon) return false; break;
      case 'onepiece': if (bid !== BRAND_IDS.onepiece) return false; break;
      case 'magic': if (bid !== BRAND_IDS.magic) return false; break;
      case 'lorcana': if (bid !== BRAND_IDS.lorcana) return false; break;
      case 'riftbound': if (bid !== BRAND_IDS.riftbound) return false; break;
      case 'autres':
        if (bid === null || bid === BRAND_IDS.pokemon || bid === BRAND_IDS.onepiece || bid === BRAND_IDS.magic || bid === BRAND_IDS.lorcana || bid === BRAND_IDS.riftbound) return false;
        break;
    }
  }
  return true;
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

export default function VintedList({ cards: initial, lots: initialLots, collectionCards: initialCollection, registered, config, vintedEnabled }: VintedListProps) {
  const router = useRouter();
  const t = useTranslations('vinted');
  const tSold = useTranslations('vintedSold');
  const tTrade = useTranslations('vintedTrade');
  const tErrors = useTranslations('errors');
  const tNav = useTranslations('nav');
  const { myUserId, partnerUserId, partnerName } = useUserContext();

  // Data state — see useDataSync for the prop→state re-sync rationale.
  const { cards, setCards, lots, setLots, collectionCards, setCollectionCards } = useDataSync(
    initial,
    initialLots,
    initialCollection,
  );

  const [filters, setFilters] = useState<VintedFilterState>(INITIAL_FILTERS);
  const [now] = useState(() => Date.now());
  // Client-side paging: render only a window of the (up to ~600) for-sale rows
  // so mobile Safari isn't asked to paint the whole list at once. Filters and
  // selection still operate on the full set.
  const [visibleForSale, setVisibleForSale] = useState(60);
  useEffect(() => {
    // Reset the window when filters change so a fresh view starts from the top.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisibleForSale(60);
  }, [filters]);

  // Track items with a queued bump (repost) job so the row can show a badge.
  const [bumpingIds, setBumpingIds] = useState<Map<string, string>>(new Map());
  const bumpPollRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const onBumpQueued = useCallback((itemId: string, jobId: string) => {
    setBumpingIds((prev) => new Map(prev).set(itemId, jobId));
    const supabase = createClient();
    const interval = setInterval(async () => {
      const { data: job } = await supabase
        .from('vinted_post_jobs')
        .select('status')
        .eq('id', jobId)
        .maybeSingle();
      if (job?.status === 'done' || job?.status === 'error') {
        clearInterval(interval);
        bumpPollRef.current.delete(itemId);
        setBumpingIds((prev) => { const next = new Map(prev); next.delete(itemId); return next; });
        router.refresh();
      }
    }, 3000);
    bumpPollRef.current.set(itemId, interval);
  }, [router]);

  // Clean up any running polls on unmount.
  useEffect(() => {
    const polls = bumpPollRef.current;
    return () => { polls.forEach((iv) => clearInterval(iv)); };
  }, []);

  // Realtime: when the partner migrates our listings to a new card (promote-after-sold),
  // the card_listings row for our user_id is deleted + re-inserted on the new card.
  // Without this, our page stays stale and shows "À retirer" until we manually refresh.
  // Debounced to 2 s to avoid cascading refreshes when the agent posts many cards at once.
  const realtimeRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!myUserId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`card-listings-${myUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'card_listings', filter: `user_id=eq.${myUserId}` },
        () => {
          if (realtimeRefreshRef.current) clearTimeout(realtimeRefreshRef.current);
          realtimeRefreshRef.current = setTimeout(() => router.refresh(), 2000);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
      if (realtimeRefreshRef.current) clearTimeout(realtimeRefreshRef.current);
    };
  }, [myUserId, router]);

  const { selectionMode, selectedIds, toggleSelect, toggleSelectionMode, cancelSelection } =
    useSelectionMode();
  const [bulkSoldOpen, setBulkSoldOpen] = useState(false);
  const [bulkTradeOpen, setBulkTradeOpen] = useState(false);
  const [tradeRecap, setTradeRecap] = useState<{
    count: number;
    autoPromoted: number;
    restocks: RestockAlert[];
  } | null>(null);
  const [tradePhotoZoom, setTradePhotoZoom] = useState<string | null>(null);
  const [pushBumpNotif, setPushBumpNotif] = useState<{ pushed: number; bumped: number; failed: number; errors: string[] } | null>(null);

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

  const updateLotQuantity = (lotId: string, quantity: number) => {
    setLots((prev) => prev.map((l): LotWithListings => (l.id === lotId ? { ...l, quantity } : l)));
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
  /** Promote candidates from a bulk-sold batch — shown together in BulkPromoteModal after the recap modal closes. */
  const [bulkPromoteCandidates, setBulkPromoteCandidates] = useState<PromoteCandidate[]>([]);
  const [annonceTarget, setAnnonceTarget] = useState<Card | null>(null);
  const [lotAnnonceTarget, setLotAnnonceTarget] = useState<Lot | null>(null);
  const [zoomCard, setZoomCard] = useState<Card | null>(null);
  const [moveToPokedexCard, setMoveToPokedexCard] = useState<Card | null>(null);
  const [comparePair, setComparePair] = useState<{ current: PokedexCompareModalCard; pokedex: PokedexCompareModalCard } | null>(null);

  /**
   * Lazy-fetch the card currently filling the Pokédex slot for `card`'s
   * pokemon_number, then open the side-by-side compare modal. Same pattern
   * as StockList — we don't pre-load slot data into the SSR query because
   * most rows never get clicked. */
  const handleCompareClick = async (card: Card) => {
    if (card.pokemon_number == null) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from('cards')
      .select('card_name, image_url, tcg_image_url, pokemon_number')
      .eq('status', 'pokedex')
      .eq('pokemon_number', card.pokemon_number)
      .maybeSingle();
    if (error || !data) {
      console.warn('[vinted] pokedex slot lookup failed', error);
      return;
    }
    setComparePair({
      current: {
        card_name: card.card_name,
        image_url: card.image_url,
        tcg_image_url: card.tcg_image_url,
        pokemon_number: card.pokemon_number,
      },
      pokedex: data as PokedexCompareModalCard,
    });
  };

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
    split?: { remaining: Lot; soldLot: Lot } | null;
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
    } else if (info.split) {
      // Lot with quantity>1: the server split off a sold clone and decremented
      // the original. The original keeps its row (and the partner's listing);
      // my ad was consumed by the sale so prune my listing. The clone joins
      // the Vendus pile.
      const { remaining, soldLot } = info.split;
      setLots((prev) => [
        ...prev.map((l): LotWithListings =>
          l.id === info.soldId
            ? { ...l, ...remaining, listings: l.listings.filter((l2) => l2.user_id !== myUserId) }
            : l,
        ),
        { ...soldLot, listings: [] },
      ]);
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
    // Side-effect: DELETE my listing after sale — but only when there is no
    // promote candidate. If a collection card can be promoted, keep the listing
    // so the migration on the new for_sale card can carry it over (it will be
    // cleaned up then). Deleting here would leave Fred's Vinted listing orphaned.
    const kind = info.kind === 'card' ? 'card' : 'lot';
    if (info.kind !== 'card' || !info.promote) {
      fetch(`/api/listings/${kind}/${info.soldId}`, { method: 'DELETE' }).catch(() => {
        // Silent — RLS allows me to delete only my own listings, error is non-fatal.
      });
    }

    // Partner cleanup notice — only relevant when partner had a listing.
    // Always queued upfront; the render gate hides it while PromoteAfterSold
    // is open. If the user promotes successfully, handlePromoted clears it
    // (the new for_sale row replaces the partner's listing semantically).
    // Split lot sale: copies remain and the partner's ad stays backed by
    // them — nothing to clean up, skip the notice.
    if (partnerListed && !info.split) {
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
          split?: boolean;
          lot?: Lot;
          soldLot?: Lot;
        };
        if (!res.ok) {
          failCount += 1;
          const localized = translateErrorCode(tErrors, json.error);
          const errLabel = localized ?? json.error ?? tErrors('unexpected');
          errors.push(`${item.kind === 'card' ? item.card.card_name : item.lot.name}: ${errLabel}`);
          continue;
        }
        soldItems.push(item);
        // Split lot sale (quantity>1): copies remain, the partner's ad stays
        // valid — never queue a cleanup notice for it.
        partnerListedFlags.push(hadPartnerListing && !json.split);
        if (item.kind === 'card') {
          setCards((prev) => prev.map((c): CardWithListings => (c.id === id ? { ...c, status: 'sold' as const, sold_price, date_sold: dateSoldIso, sold_by_user_id: myUserId, listings: c.listings.filter((l) => l.user_id !== myUserId) } : c)));
          if (json.restock) restocks.push(json.restock);
          if (json.promote) promotes.push(json.promote);
        } else if (json.split && json.lot && json.soldLot) {
          // Quantity>1 lot: original decremented (keeps partner listing), sold
          // clone appended — see handleSold for the single-item rationale.
          const remaining = json.lot;
          const soldClone = json.soldLot;
          setLots((prev) => [
            ...prev.map((l): LotWithListings =>
              l.id === id
                ? { ...l, ...remaining, listings: l.listings.filter((l2) => l2.user_id !== myUserId) }
                : l,
            ),
            { ...soldClone, listings: [] },
          ]);
        } else {
          setLots((prev) => prev.map((l): LotWithListings => (l.id === id ? { ...l, status: 'sold' as const, sold_price, date_sold: dateSoldIso, sold_by_user_id: myUserId, listings: l.listings.filter((l2) => l2.user_id !== myUserId) } : l)));
        }
        // Keep the listing when a promote candidate exists so the migration on
        // the new for_sale card can carry it over.  Delete immediately only
        // when there is no pending restock (otherwise the Vinted listing is lost).
        const kind = item.kind === 'card' ? 'card' : 'lot';
        if (item.kind !== 'card' || !json.promote) {
          fetch(`/api/listings/${kind}/${id}`, { method: 'DELETE' }).catch(() => {
            // Silent — best-effort
          });
        }
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
      alert(tSold('bulkAlertNoSuccess', { failCount, errors: errors.join('\n') }));
    }
  }

  /**
   * Bulk Push/Bump — for every selected for-sale item: publish it if it's
   * offline, or repost it (delete + republish, to bump it up Vinted's search)
   * if it's already online. Reuses the per-item bump spinner + job polling.
   */
  async function handleBulkPushBump() {
    const selCards = cards.filter((c) => c.status === 'for_sale' && selectedIds.has(c.id));
    const selLots = lots.filter((l) => l.status === 'for_sale' && selectedIds.has(l.id));
    const items = [
      ...selCards.map((c) => ({ kind: 'card' as const, id: c.id, listings: c.listings as BaseListing[], label: c.card_name })),
      ...selLots.map((l) => ({ kind: 'lot' as const, id: l.id, listings: l.listings as BaseListing[], label: l.name })),
    ];
    let pushed = 0;
    let bumped = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const it of items) {
      const online = getMyListing(it.listings ?? [], myUserId)?.vinted_listing_id != null;
      const endpoint = online ? '/api/vinted/bump-job' : '/api/vinted/post-job';
      const body = it.kind === 'card' ? { card_id: it.id } : { lot_id: it.id };
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.status === 201) {
          const { job_id } = (await res.json()) as { job_id: string };
          onBumpQueued(it.id, job_id); // spinner badge + poll + refresh on done
          if (online) bumped += 1;
          else pushed += 1;
        } else {
          failed += 1;
          const json = (await res.json().catch(() => ({}))) as { error?: string };
          errors.push(`${it.label}: ${translateErrorCode(tErrors, json.error) ?? json.error ?? res.status}`);
        }
      } catch (e) {
        failed += 1;
        errors.push(`${it.label}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    cancelSelection();
    setPushBumpNotif({ pushed, bumped, failed, errors });
  }

  /**
   * Bulk trade — the exchange happened OFF Vinted, so both users' ads are
   * still live for the card group. Per card:
   *   - PATCH status='traded' (+ shared trade photo URL, uploaded once).
   *   - stock copy available → silently promote it: the server migrates every
   *     real listing to the new row, so nothing visibly changes except the
   *     stock count ("ça bouge pas, ça enlève juste du stock").
   *   - no stock copy → my listing comes down, and if the partner had one
   *     they get the usual cleanup notice.
   */
  async function handleBulkTrade(cardsToTrade: CardWithListings[], dateIso: string, photo: Blob | null) {
    // Upload the trade photo once — its URL is stamped on every card. A failed
    // upload aborts (thrown into the modal) so the user can retry or drop it.
    let photoUrl: string | null = null;
    if (photo) {
      const up = await uploadTradePhoto(photo);
      if (!up.url) {
        throw new Error(translateErrorCode(tErrors, up.error) ?? up.error ?? tErrors('unexpected'));
      }
      photoUrl = up.url;
    }

    const restocks: RestockAlert[] = [];
    const failedPromotes: PromoteCandidate[] = [];
    const cleanupQueue: Array<{ itemKind: 'card' | 'lot'; itemDisplayName: string }> = [];
    let okCount = 0;
    let autoPromoted = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (const card of cardsToTrade) {
      const hadPartnerListing = getPartnerListing(card.listings ?? [], partnerUserId) !== null;
      try {
        const res = await fetch(`/api/cards/${card.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'traded', traded_at: dateIso, trade_photo_url: photoUrl }),
        });
        const json = (await res.json()) as {
          error?: string;
          restock?: RestockAlert | null;
          promote?: PromoteCandidate | null;
        };
        if (!res.ok) {
          failCount += 1;
          const localized = translateErrorCode(tErrors, json.error);
          errors.push(`${card.card_name}: ${localized ?? json.error ?? tErrors('unexpected')}`);
          continue;
        }
        okCount += 1;
        setCards((prev) =>
          prev.map((c): CardWithListings =>
            c.id === card.id
              ? {
                  ...c,
                  status: 'traded' as const,
                  traded_at: dateIso,
                  traded_by_user_id: myUserId,
                  trade_photo_url: photoUrl,
                  listings: c.listings.filter((l) => l.user_id !== myUserId),
                }
              : c,
          ),
        );
        if (json.restock) restocks.push(json.restock);

        let promoted = false;
        if (json.promote) {
          const promoteRes = await fetch(`/api/cards/${json.promote.cardId}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ status: 'for_sale' }),
          });
          if (promoteRes.ok) {
            promoted = true;
            autoPromoted += 1;
          } else {
            // Rare (e.g. concurrent for_sale conflict) — fall back to the
            // manual BulkPromoteModal. Keep my listing so the migration can
            // still carry it over when the user resolves it.
            failedPromotes.push(json.promote);
          }
        }
        if (!promoted) {
          if (!json.promote) {
            fetch(`/api/listings/card/${card.id}`, { method: 'DELETE' }).catch(() => {
              // Silent — best-effort
            });
          }
          if (hadPartnerListing) {
            cleanupQueue.push({ itemKind: 'card', itemDisplayName: card.card_name });
          }
        }
      } catch (e) {
        failCount += 1;
        errors.push(`${card.card_name}: ${e instanceof Error ? e.message : 'network'}`);
      }
    }

    if (cleanupQueue.length > 0) setPartnerCleanupQueue(cleanupQueue);
    if (failedPromotes.length > 0) setBulkPromoteCandidates(failedPromotes);

    if (failCount > 0) {
      console.warn(`[bulk-trade] ${okCount} échangées, ${failCount} échec(s)`, errors);
    }

    if (okCount > 0) {
      setTradeRecap({ count: okCount, autoPromoted, restocks });
      // Re-sync stock counts + migrated listings written server-side.
      router.refresh();
    } else if (failCount > 0) {
      alert(tTrade('bulkAlertNoSuccess', { failCount, errors: errors.join('\n') }));
    }
  }

  // After the bulk recap modal closes, open the BulkPromoteModal with all
  // promote candidates at once instead of draining them one-by-one.
  function dismissBulkRecap() {
    if (!bulkRecap) return;
    const queue = [...bulkRecap.promotes];
    setBulkRecap(null);
    if (queue.length > 0) setBulkPromoteCandidates(queue);
  }

  const { forSaleRows, soldRows, tradedRows, soldLotsList, totalVisible } = useMemo(() => {
    // Cards are always Pokémon — hide them when a non-Pokémon brand is selected.
    const showCards = filters.kindFilter === 'cards'
      || (filters.kindFilter === 'all' && (filters.lotBrand === 'all' || filters.lotBrand === 'pokemon'));
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
    // Traded pile — same exclusion rule as sold.
    const traded = cards.filter((c) => c.status === 'traded' && !inActionPile(c));

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

    // Traded pile — gated by the Échangés chip, most recent trades first.
    const tradedSubset = !showCards || !filters.showTraded
      ? []
      : traded
          .filter(passesCommon)
          .sort((a, b) => (b.traded_at ?? '').localeCompare(a.traded_at ?? ''));

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
            matchesLotFilters(l, filters) &&
            passesStateChips(getMyListing(l.listings, myUserId), filters, now) &&
            passesMultiUserChip(l as { status: string; listings: BaseListing[] }, filters.multiUserChip, myUserId, partnerUserId),
        );

    const groupedCards = groupCards(finalForSale) as CardGroupWithListings[];
    const forSaleRows: MixedRow[] = interleaveCardsAndLots(groupedCards, forSaleLots, now, myUserId, filters.sortDirection);

    const soldLotsList = !showLots || !filters.showSold
      ? []
      : lots
          .filter((l) => l.status === 'sold' && !lotInActionPile(l) && matchesLotSearch(l, filters.search) && matchesLotFilters(l, filters))
          .sort((a, b) => (b.date_sold ?? '').localeCompare(a.date_sold ?? ''));

    return {
      forSaleRows,
      soldRows: soldSubset,
      tradedRows: tradedSubset,
      soldLotsList,
      totalVisible: finalForSale.length + soldSubset.length + tradedSubset.length + forSaleLots.length + soldLotsList.length,
    };
  }, [cards, lots, filters, now, myUserId, partnerUserId]);

  const isEmpty =
    forSaleRows.length === 0 && soldRows.length === 0 && tradedRows.length === 0 && soldLotsList.length === 0;

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
          <p className="text-text-muted text-sm">{t('emptyFiltered')}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {forSaleRows.slice(0, visibleForSale).map((row) =>
            row.kind === 'card' ? (
              <VintedRow
                key={row.group.key}
                group={row.group}
                isRegistered={
                  row.group.head.pokemon_number != null && registered.has(row.group.head.pokemon_number)
                }
                priceCell={
                  <EditablePriceCell
                    cardId={row.group.head.id}
                    initialPrice={row.group.head.suggested_price}
                    onSaved={(newPrice) => updateCardPrice(row.group.head.id, newPrice)}
                  />
                }
                onAnnonceClick={() => setAnnonceTarget(row.group.head)}
                onSoldClick={() => setSoldTarget({ kind: 'card', card: row.group.head })}
                listings={row.group.head.listings ?? []}
                myUserId={myUserId}
                partnerUserId={partnerUserId}
                partnerName={partnerName}
                onListingsChanged={onListingsChanged}
                onBumpQueued={onBumpQueued}
                isBumping={bumpingIds.has(row.group.head.id)}
                onImageClick={() => setZoomCard(row.group.head)}
                onMoveToPokedexClick={() => setMoveToPokedexCard(row.group.head)}
                onComparePokedexClick={() => void handleCompareClick(row.group.head)}
                selectionMode={selectionMode}
                selected={selectedIds.has(row.group.head.id)}
                onToggleSelect={() => toggleSelect(row.group.head.id)}
                stockCount={stockCountByGroup.get(groupKey(row.group.head)) ?? 0}
                onSetStockCount={(target) => handleSetStockCount(row.group.head, target)}
                stockBusy={stockBusyKeys.has(row.group.key)}
                vintedEnabled={vintedEnabled}
              />
            ) : (
              <LotRow
                key={`lot-${row.lot.id}`}
                lot={row.lot}
                storagePublicUrl={storagePublicUrl}
                onAnnonceClick={(lot) => setLotAnnonceTarget(lot)}
                onSoldClick={(lot) => setSoldTarget({ kind: 'lot', lot })}
                onPriceSaved={updateLotPrice}
                onQuantitySaved={updateLotQuantity}
                listings={row.lot.listings ?? []}
                myUserId={myUserId}
                partnerUserId={partnerUserId}
                partnerName={partnerName}
                onListingsChanged={onListingsChanged}
                onBumpQueued={onBumpQueued}
                isBumping={bumpingIds.has(row.lot.id)}
                selectionMode={selectionMode}
                selected={selectedIds.has(row.lot.id)}
                onToggleSelect={() => toggleSelect(row.lot.id)}
                vintedEnabled={vintedEnabled}
              />
            ),
          )}
          {forSaleRows.length > visibleForSale && (
            <li>
              <button
                type="button"
                onClick={() => setVisibleForSale((n) => n + 60)}
                className="bg-surface-2 border-border text-text-muted hover:text-text w-full rounded border py-2.5 text-sm font-medium transition-colors"
              >
                {t('loadMore', { count: forSaleRows.length - visibleForSale })}
              </button>
            </li>
          )}
          {soldRows.map((c) => (
            <SoldRow key={c.id} card={c} onAnnonceClick={(card) => setAnnonceTarget(card)} />
          ))}
          {tradedRows.map((c) => (
            <TradedRow
              key={c.id}
              card={c}
              onImageClick={(card) => setZoomCard(card)}
              onTradePhotoClick={(url) => setTradePhotoZoom(url)}
            />
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
            onTrade={() => setBulkTradeOpen(true)}
            onPushBump={handleBulkPushBump}
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

      {bulkTradeOpen && (
        <BulkTradeModal
          cards={cards.filter((c) => c.status === 'for_sale' && selectedIds.has(c.id))}
          onClose={() => setBulkTradeOpen(false)}
          onConfirm={async (dateIso, photo) => {
            const selectedCards = cards.filter((c) => c.status === 'for_sale' && selectedIds.has(c.id));
            await handleBulkTrade(selectedCards, dateIso, photo);
            setBulkTradeOpen(false);
            cancelSelection();
          }}
        />
      )}

      {tradeRecap && (
        <TradeRecapModal
          count={tradeRecap.count}
          autoPromoted={tradeRecap.autoPromoted}
          restocks={tradeRecap.restocks}
          onClose={() => setTradeRecap(null)}
        />
      )}

      {pushBumpNotif && (
        <PushBumpSentModal
          pushed={pushBumpNotif.pushed}
          bumped={pushBumpNotif.bumped}
          failed={pushBumpNotif.failed}
          errors={pushBumpNotif.errors}
          onClose={() => setPushBumpNotif(null)}
        />
      )}

      {bulkRecap && (
        <BulkSoldRecapModal
          items={bulkRecap.items}
          restocks={bulkRecap.restocks}
          onClose={dismissBulkRecap}
        />
      )}

      {bulkPromoteCandidates.length > 0 && (
        <BulkPromoteModal
          candidates={bulkPromoteCandidates}
          onClose={() => setBulkPromoteCandidates([])}
          onPromoted={(promotedIds) => {
            setCards((prev) =>
              prev.map((c) =>
                promotedIds.includes(c.id) ? { ...c, status: 'for_sale' as const } : c,
              ),
            );
            setBulkPromoteCandidates([]);
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
          items={[{ displayName: partnerCleanup.itemDisplayName, kind: partnerCleanup.itemKind }]}
          onClose={() => setPartnerCleanup(null)}
        />
      )}

      {/* Bulk partner cleanup queue — drained one-by-one AFTER the bulk recap
        and bulk-promote queue both finish. Same modal as the single-item
        flow, surfaced for each unreplaced sold item that had a partner
        listing. */}
      {!bulkRecap && !tradeRecap && bulkPromoteCandidates.length === 0 && partnerCleanupQueue.length > 0 && partnerName && (
        <PartnerCleanupModal
          partnerName={partnerName}
          items={partnerCleanupQueue.map((e) => ({ displayName: e.itemDisplayName, kind: e.itemKind }))}
          onClose={() => setPartnerCleanupQueue([])}
        />
      )}
      {annonceTarget && (() => {
        const targetWithListings = cards.find((c) => c.id === annonceTarget.id);
        return (
          <AnnonceModal
            card={annonceTarget}
            config={vintedConfig}
            listings={targetWithListings?.listings ?? []}
            myUserId={myUserId}
            partnerUserId={partnerUserId}
            partnerName={partnerName}
            onListingsChanged={onListingsChanged}
            onClose={() => setAnnonceTarget(null)}
            onPriceSaved={(cardId, newPrice) => {
              updateCardPrice(cardId, newPrice);
              setAnnonceTarget((prev) => (prev && prev.id === cardId ? { ...prev, suggested_price: newPrice } : prev));
            }}
            onCardRefreshed={(updated) => {
              setCards((prev) => prev.map((c): CardWithListings => (c.id === updated.id ? { ...updated, listings: c.listings } : c)));
              setAnnonceTarget(updated);
            }}
          />
        );
      })()}
      {lotAnnonceTarget && (
        <LotAnnonceModal
          lot={lotAnnonceTarget}
          storagePublicUrl={storagePublicUrl}
          onClose={() => setLotAnnonceTarget(null)}
          onPriceSaved={(lotId, newPrice) => {
            updateLotPrice(lotId, newPrice);
            setLotAnnonceTarget((prev) => (prev && prev.id === lotId ? { ...prev, price: newPrice } : prev));
          }}
          onLotDeleted={() => {
            setLots((prev) => prev.filter((l) => l.id !== lotAnnonceTarget.id));
            router.refresh();
          }}
          onMovedToStock={() => {
            // The lot left the Vinted pile for /stock — drop it locally.
            setLots((prev) => prev.filter((l) => l.id !== lotAnnonceTarget.id));
            router.refresh();
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
      {tradePhotoZoom && (
        <CardZoomModal
          src={tradePhotoZoom}
          alt={tTrade('photoPreviewAlt')}
          onClose={() => setTradePhotoZoom(null)}
        />
      )}
      {comparePair && (
        <PokedexCompareModal
          currentCard={comparePair.current}
          pokedexCard={comparePair.pokedex}
          currentLabel={tNav('vinted')}
          onClose={() => setComparePair(null)}
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
