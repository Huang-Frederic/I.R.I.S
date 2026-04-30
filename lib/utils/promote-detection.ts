import type { Card } from '@/lib/types';

export interface PromoteCandidate {
  cardId: string;
  imageUrl: string | null;
  tcgImageUrl: string | null;
  cardName: string;
  setName: string | null;
  setCode: string | null;
  language: string;
  condition: string;
  rarity: string;
  variant: string | null;
}

interface DetectInput {
  /** The just-sold card (used to compute the group key). */
  soldCard: Pick<Card, 'card_id_tcg' | 'language' | 'condition' | 'variant'>;
  /** Candidate stock cards (status='collection') to look in. */
  stockCards: Card[];
}

function groupKey(c: Pick<Card, 'card_id_tcg' | 'language' | 'condition' | 'variant'>): string {
  return `${c.card_id_tcg ?? ''}|${c.language}|${c.condition}|${c.variant ?? 'standard'}`;
}

/**
 * Find the OLDEST stock card matching the just-sold card's group key, or null.
 * Pure function — caller fetches the candidate set.
 */
export function detectPromotable(input: DetectInput): PromoteCandidate | null {
  const target = groupKey(input.soldCard);
  const matches = input.stockCards.filter((c) => groupKey(c) === target);
  if (matches.length === 0) return null;
  // Pick the oldest (FIFO across stock copies)
  matches.sort((a, b) => a.date_added.localeCompare(b.date_added));
  const c = matches[0];
  return {
    cardId: c.id,
    imageUrl: c.image_url,
    tcgImageUrl: c.tcg_image_url,
    cardName: c.card_name,
    setName: c.set_name,
    setCode: c.set_code,
    language: c.language,
    condition: c.condition,
    rarity: c.rarity,
    variant: c.variant,
  };
}
