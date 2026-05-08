import type { Card } from '@/lib/types';

export type PricingCategory = 'tcgdex' | 'backfill' | 'skip';

/**
 * Decide what the cron should do for one card.
 *
 *   tcgdex   — card_id_tcg known, try the local Cardmarket dumps first then
 *              TCGdex live as fallback
 *   backfill — card_id_tcg unknown but set_code/number/language are usable;
 *              the catalog backfill happens before lookup, then same as above
 *   skip     — variant != null (preserve manual prices) or no identifiers
 *
 * NOTE: language is NOT filtered here. JP sets ARE on Cardmarket (listed
 * under the EN translation of the JP set name, e.g. Cyber Judge / Crimson
 * Haze) — the dump lookup handles them. KO/CN are still effectively
 * unsupported but we let them flow through and surface the empty result
 * downstream rather than refusing pre-emptively.
 */
export function categorizePricingCard(card: Card): PricingCategory {
  if (card.variant !== null) return 'skip';
  if (card.card_id_tcg !== null) return 'tcgdex';
  if (card.set_code && card.set_number) return 'backfill';
  return 'skip';
}
