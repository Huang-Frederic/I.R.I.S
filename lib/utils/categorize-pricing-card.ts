import type { Card, CardLanguage } from '@/lib/types';

export type PricingCategory = 'tcgdex' | 'backfill' | 'skip';

// Languages where Cardmarket actually sells cards. JP/KO/CN/ZH have no
// Cardmarket pricing source — TCGdex returns null even when the catalog has
// the card. Skip them in the pricing pipeline rather than burning API calls.
const CARDMARKET_LANGUAGES: ReadonlySet<CardLanguage> = new Set([
  'EN', 'FR', 'DE', 'IT', 'ES', 'PT',
]);

/**
 * Decide what the cron should do for one card.
 *
 *   tcgdex   — card_id_tcg known, fetch TCGdex directly
 *   backfill — card_id_tcg unknown but set_code/number/language are usable,
 *              try the catalog lookup first, then TCGdex
 *   skip     — variant != null (preserve manual prices), missing identifiers,
 *              or language not sold on Cardmarket (JP, KO, CN, ZH)
 */
export function categorizePricingCard(card: Card): PricingCategory {
  if (card.variant !== null) return 'skip';
  if (!CARDMARKET_LANGUAGES.has(card.language)) return 'skip';
  if (card.card_id_tcg !== null) return 'tcgdex';
  if (card.set_code && card.set_number) return 'backfill';
  return 'skip';
}
