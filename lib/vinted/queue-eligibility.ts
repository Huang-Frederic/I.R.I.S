import type { Card } from '@/lib/types';

/**
 * A card/lot is eligible for the autonomous posting queue only when its
 * price was set/reviewed by the user themselves — `price_confirmed_at`,
 * not merely a non-null `suggested_price` (which a background cron can set
 * without anyone looking at it, see cards.price_confirmed_at's migration
 * comment).
 */
export function isEligibleForQueue(card: Pick<Card, 'status' | 'price_confirmed_at'>): boolean {
  return card.status === 'for_sale' && card.price_confirmed_at !== null;
}
