// lib/utils/stock-value.ts
import type { CardStatus } from '@/lib/types';

export interface PricedCard {
  status: CardStatus;
  cm_price_avg: number | null;
  cm_price_trend: number | null;
  cm_price_low: number | null;
}

export interface StockValueResult {
  value_for_sale: number;
  value_collection: number;
  count_for_sale: number;
  count_collection: number;
}

function priceOf(card: PricedCard): number {
  return card.cm_price_avg ?? card.cm_price_trend ?? card.cm_price_low ?? 0;
}

export function computeStockValue(cards: readonly PricedCard[]): StockValueResult {
  const result: StockValueResult = {
    value_for_sale: 0,
    value_collection: 0,
    count_for_sale: 0,
    count_collection: 0,
  };
  for (const card of cards) {
    if (card.status === 'for_sale') {
      result.value_for_sale += priceOf(card);
      result.count_for_sale += 1;
    } else if (card.status === 'collection') {
      result.value_collection += priceOf(card);
      result.count_collection += 1;
    }
  }
  result.value_for_sale = Math.round(result.value_for_sale * 100) / 100;
  result.value_collection = Math.round(result.value_collection * 100) / 100;
  return result;
}
