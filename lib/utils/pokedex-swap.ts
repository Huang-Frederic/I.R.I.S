/**
 * Pure model of the 3-step pokédex-replace algorithm executed server-side
 * by the `replace_pokedex_card` RPC. Mirrored here so we can unit-test the
 * algorithm without spinning up a Postgres instance.
 *
 * Real DB enforcement comes from the `one_for_sale_per_group` partial unique
 * index. We model that constraint in a `Set` keyed by group key, and walk
 * the three UPDATE steps in order — failing fast if any step would violate
 * the index.
 */

export type Status = 'pokedex' | 'for_sale' | 'collection' | 'sold';

export interface SwapCard {
  id: string;
  status: Status;
  /** Group key — same shape used by the DB partial unique index. */
  groupKey: string;
}

export class ForSaleConflictError extends Error {
  constructor(public readonly conflictingCardId: string) {
    super(`for_sale_conflict on ${conflictingCardId}`);
  }
}

/**
 * Run the 3-step replace_pokedex_card algorithm. Returns the new card states.
 * Throws ForSaleConflictError if the unique constraint would be violated at
 * any step. Mutates input is forbidden — returns fresh objects.
 */
export function applyReplacePokedex(
  allCards: SwapCard[],
  oldCardId: string,
  newCardId: string,
  oldNewStatus: 'for_sale' | 'collection',
): SwapCard[] {
  let state = allCards.map((c) => ({ ...c }));

  const setStatus = (cardId: string, next: Status): void => {
    const card = state.find((c) => c.id === cardId);
    if (!card) throw new Error(`card ${cardId} not found`);
    const wouldBeFor_sale = next === 'for_sale';
    if (wouldBeFor_sale) {
      const conflict = state.find(
        (c) => c.id !== cardId && c.status === 'for_sale' && c.groupKey === card.groupKey,
      );
      if (conflict) throw new ForSaleConflictError(conflict.id);
    }
    state = state.map((c) => (c.id === cardId ? { ...c, status: next } : c));
  };

  // Step 1: park `old` in collection (always safe).
  setStatus(oldCardId, 'collection');
  // Step 2: promote candidate to pokedex. Frees its for_sale slot if any.
  setStatus(newCardId, 'pokedex');
  // Step 3: send `old` to its target. for_sale slot has been vacated.
  setStatus(oldCardId, oldNewStatus);

  return state;
}
