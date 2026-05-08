import type { Card } from '@/lib/types';

export interface CardGroup {
  key: string;
  /** Cards sorted by date_added ASC. */
  cards: Card[];
  /** FIFO-first card — the one displayed and targeted by "Vendu". */
  head: Card;
  /** Number of cards in this group. */
  count: number;
  /** Global FIFO position #1, #2, ... assigned by `groupCards`. */
  position: number;
}

/**
 * Compose the doublon-grouping key. Includes `variant` because Poké Ball /
 * Master Ball / Reverse Holo / Promo each carry distinct Vinted prices.
 *
 * When `card_id_tcg` is null (catalogue miss), fall back to a composite
 * built from pokemon_number + set_code + set_number, which uniquely
 * identifies a printed card in practice.
 */
export function groupKey(card: Card): string {
  const id =
    card.card_id_tcg ??
    `${card.pokemon_number}-${card.set_code ?? '?'}-${card.set_number ?? '?'}`;
  const variant = card.variant ?? 'standard';
  return `${id}|${card.language}|${card.condition}|${variant}`;
}

/**
 * Fold a flat list of cards into FIFO-ordered groups.
 *
 * - Within each group: cards sorted by `date_added` ASC (oldest first = head).
 * - Across groups: ordered by the head's `date_added` ASC.
 * - Each group gets a `position` 1..N for display.
 *
 * Pure function — feed it the already-filtered list.
 */
export function groupCards(cards: Card[]): CardGroup[] {
  const buckets = new Map<string, Card[]>();
  for (const card of cards) {
    const key = groupKey(card);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(card);
    } else {
      buckets.set(key, [card]);
    }
  }

  const sortByDate = (a: Card, b: Card) => a.date_added.localeCompare(b.date_added);

  const groups: Omit<CardGroup, 'position'>[] = [];
  for (const [key, bucket] of buckets) {
    bucket.sort(sortByDate);
    // Head = the card that best represents the group's current state.
    // Prefer status='for_sale' (the active listing — what the user actually
    // acts on) over historical sold rows. Without this, a group with
    // [oldSold, newForSale] would render as the oldSold (showing "À retirer"
    // and the partner's stale listing) when it should render as the active
    // for-sale row. Falls back to oldest when no for_sale is present.
    const activeForSale = bucket.find((c) => c.status === 'for_sale');
    // Count = active rows only (exclude sold history). Otherwise a group
    // with [1 sold, 1 for_sale] would display "x2" when only 1 copy is
    // actually present right now.
    const activeCount = bucket.filter((c) => c.status !== 'sold').length;
    groups.push({
      key,
      cards: bucket,
      head: activeForSale ?? bucket[0],
      count: activeCount > 0 ? activeCount : bucket.length,
    });
  }

  groups.sort((a, b) => sortByDate(a.head, b.head));

  return groups.map((g, i) => ({ ...g, position: i + 1 }));
}
