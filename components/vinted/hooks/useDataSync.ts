'use client';

import { useEffect, useState } from 'react';
import type { Card, CardWithListings, LotWithListings } from '@/lib/types';

/**
 * Hold the three server-rendered card/lot collections in local state, and
 * re-sync whenever the parent re-passes them (typically after a
 * `router.refresh()` following a listing toggle / sold action).
 *
 * Without the re-sync, useState's initial value stays frozen and the UI
 * doesn't reflect SSR re-fetches. The setState-in-effect cascade fires once
 * per SSR refetch — that's the goal here, not a bug.
 *
 * Returns the live state plus the setters so the caller can apply optimistic
 * updates between SSR roundtrips.
 */
export function useDataSync(
  initialCards: CardWithListings[],
  initialLots: LotWithListings[],
  initialCollection: Card[],
) {
  const [cards, setCards] = useState<CardWithListings[]>(initialCards);
  const [lots, setLots] = useState<LotWithListings[]>(initialLots);
  const [collectionCards, setCollectionCards] = useState<Card[]>(initialCollection);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setCards(initialCards); }, [initialCards]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setLots(initialLots); }, [initialLots]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setCollectionCards(initialCollection); }, [initialCollection]);

  return {
    cards,
    setCards,
    lots,
    setLots,
    collectionCards,
    setCollectionCards,
  };
}
