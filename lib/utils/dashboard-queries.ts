import type { CardRarity } from '@/lib/types';

export function buildRarityCounts(
  cards: readonly { rarity: CardRarity }[],
): { rarity: CardRarity; count: number }[] {
  const counts = new Map<CardRarity, number>();
  for (const c of cards) {
    counts.set(c.rarity, (counts.get(c.rarity) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([rarity, count]) => ({ rarity, count }))
    .sort((a, b) => b.count - a.count);
}

interface PricedCard {
  cm_price_avg: number | null;
  cm_price_trend: number | null;
  cm_price_low: number | null;
}

function priceOf(card: PricedCard): number | null {
  return card.cm_price_avg ?? card.cm_price_trend ?? card.cm_price_low;
}

export function topRaresByPrice<T extends PricedCard>(
  cards: readonly T[],
  limit: number,
): T[] {
  return cards
    .filter((c) => priceOf(c) !== null)
    .map((c) => ({ card: c, price: priceOf(c)! }))
    .sort((a, b) => b.price - a.price)
    .slice(0, limit)
    .map(({ card }) => card);
}

/**
 * Builds a 52×7 matrix of scan counts.
 * Row 0 = current week, row 51 = 51 weeks ago.
 * Column 0 = Monday, column 6 = Sunday.
 * `anchor` is "today" — week boundaries computed from it.
 */
export function buildHeatmapMatrix(
  events: readonly { created_at: string }[],
  anchor: Date,
): number[][] {
  const matrix: number[][] = Array.from({ length: 52 }, () => Array(7).fill(0));

  // Find the Monday of the anchor week (UTC).
  const anchorDay = (anchor.getUTCDay() + 6) % 7; // 0 = Mon, 6 = Sun
  const monday0 = new Date(anchor);
  monday0.setUTCDate(anchor.getUTCDate() - anchorDay);
  monday0.setUTCHours(0, 0, 0, 0);

  for (const ev of events) {
    const ts = new Date(ev.created_at);
    // Day of week in our local Mon=0..Sun=6 system:
    const dow = (ts.getUTCDay() + 6) % 7;
    // Find the Monday of the event's week:
    const tsMidnight = new Date(ts);
    tsMidnight.setUTCHours(0, 0, 0, 0);
    const tsMonday = new Date(tsMidnight);
    tsMonday.setUTCDate(tsMidnight.getUTCDate() - dow);
    const weeksAgo = Math.round((monday0.getTime() - tsMonday.getTime()) / (7 * 86_400_000));
    if (weeksAgo >= 0 && weeksAgo < 52) {
      matrix[weeksAgo][dow] += 1;
    }
  }
  return matrix;
}
