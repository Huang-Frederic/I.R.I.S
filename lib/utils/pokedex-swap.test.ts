import { describe, expect, it } from 'vitest';
import {
  applyReplacePokedex,
  ForSaleConflictError,
  type SwapCard,
} from './pokedex-swap';

const G = 'sv5a-070|JP|NM|standard';
const OTHER = 'sv5a-071|JP|NM|standard';

describe('applyReplacePokedex', () => {
  it('swaps a pokedex card with a collection candidate', () => {
    const cards: SwapCard[] = [
      { id: 'A', status: 'pokedex', groupKey: G },
      { id: 'B', status: 'collection', groupKey: G },
    ];
    const next = applyReplacePokedex(cards, 'A', 'B', 'collection');
    expect(next.find((c) => c.id === 'A')!.status).toBe('collection');
    expect(next.find((c) => c.id === 'B')!.status).toBe('pokedex');
  });

  it('handles the case the original 2-step RPC failed: candidate is for_sale, displaced goes to for_sale', () => {
    // This is the bug we're fixing: A in pokedex, B in for_sale (same group),
    // user wants to swap and put A in for_sale. Old RPC tried "UPDATE A
    // for_sale" first, which collided with B still being for_sale. The new
    // 3-step parks A in collection first, then moves B out of for_sale via
    // pokedex, then lands A safely in the freed for_sale slot.
    const cards: SwapCard[] = [
      { id: 'A', status: 'pokedex', groupKey: G },
      { id: 'B', status: 'for_sale', groupKey: G },
    ];
    const next = applyReplacePokedex(cards, 'A', 'B', 'for_sale');
    expect(next.find((c) => c.id === 'A')!.status).toBe('for_sale');
    expect(next.find((c) => c.id === 'B')!.status).toBe('pokedex');
  });

  it('handles the simpler "displaced goes to collection" case when candidate is for_sale', () => {
    const cards: SwapCard[] = [
      { id: 'A', status: 'pokedex', groupKey: G },
      { id: 'B', status: 'for_sale', groupKey: G },
    ];
    const next = applyReplacePokedex(cards, 'A', 'B', 'collection');
    expect(next.find((c) => c.id === 'A')!.status).toBe('collection');
    expect(next.find((c) => c.id === 'B')!.status).toBe('pokedex');
  });

  it('handles candidate from a DIFFERENT group going into pokedex', () => {
    const cards: SwapCard[] = [
      { id: 'A', status: 'pokedex', groupKey: G },
      { id: 'B', status: 'for_sale', groupKey: OTHER },
    ];
    const next = applyReplacePokedex(cards, 'A', 'B', 'for_sale');
    expect(next.find((c) => c.id === 'A')!.status).toBe('for_sale');
    expect(next.find((c) => c.id === 'B')!.status).toBe('pokedex');
  });

  it('throws ForSaleConflictError if a THIRD card of the same group is already for_sale and target is for_sale', () => {
    // Real corruption case: the constraint allows only one for_sale per group,
    // so this scenario shouldn't normally arise — but if data is dirty, the
    // RPC must fail (cleanly) rather than corrupt further.
    const cards: SwapCard[] = [
      { id: 'A', status: 'pokedex', groupKey: G },
      { id: 'B', status: 'collection', groupKey: G },
      { id: 'C', status: 'for_sale', groupKey: G }, // unrelated, not in the swap
    ];
    expect(() => applyReplacePokedex(cards, 'A', 'B', 'for_sale')).toThrow(
      ForSaleConflictError,
    );
  });

  it('does NOT throw when the third card is in a different group', () => {
    const cards: SwapCard[] = [
      { id: 'A', status: 'pokedex', groupKey: G },
      { id: 'B', status: 'collection', groupKey: G },
      { id: 'C', status: 'for_sale', groupKey: OTHER },
    ];
    const next = applyReplacePokedex(cards, 'A', 'B', 'for_sale');
    expect(next.find((c) => c.id === 'A')!.status).toBe('for_sale');
  });

  it('does not mutate the input array', () => {
    const cards: SwapCard[] = [
      { id: 'A', status: 'pokedex', groupKey: G },
      { id: 'B', status: 'for_sale', groupKey: G },
    ];
    const snapshot = cards.map((c) => ({ ...c }));
    applyReplacePokedex(cards, 'A', 'B', 'collection');
    expect(cards).toEqual(snapshot);
  });
});
