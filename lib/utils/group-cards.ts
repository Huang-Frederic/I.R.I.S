// lib/utils/group-cards.ts
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
    groups.push({
      key,
      cards: bucket,
      head: bucket[0],
      count: bucket.length,
    });
  }

  groups.sort((a, b) => sortByDate(a.head, b.head));

  return groups.map((g, i) => ({ ...g, position: i + 1 }));
}
