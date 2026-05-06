import type { CardCondition, CardLanguage, CardRarity, CardStatus } from '@/lib/types';

/**
 * Shared field set for every row in a batch insert. Status is computed per
 * row (the FIRST row gets the requested status, copies fall back to
 * 'collection' when the requested status is one-per-group constrained).
 */
export interface BatchRowBase {
  pokemon_name: string | null;
  pokemon_number: number | null;
  card_name: string;
  card_id_tcg: string | null;
  set_name: string | null;
  set_code: string | null;
  set_number: string | null;
  language: CardLanguage;
  rarity: CardRarity;
  condition: CardCondition;
  image_url: string | null;
  tcg_image_url: string | null;
  notes: string | null;
  variant: string | null;
  cardmarket_id: string | null;
  cm_price_low: number | null;
  cm_price_trend: number | null;
  cm_price_avg: number | null;
  suggested_price: number | null;
  cm_updated_at: string | null;
}

export interface BatchRow extends BatchRowBase {
  id: string;
  status: CardStatus;
}

/**
 * Compute the per-row status for a batch insert.
 *
 * Pokédex and for_sale are bound by partial unique indexes — only ONE row per
 * group can hold those statuses at a time. So when count > 1:
 *   - The first copy keeps the requested status.
 *   - Copies 2..N fall back to 'collection' (Stock).
 *
 * For requested status='collection' (no constraint), all copies stay collection.
 *
 * Pure function — caller composes with the BatchRowBase to get the final rows.
 */
export function statusForCopy(
  copyIndex: number,
  requested: CardStatus,
): CardStatus {
  if (copyIndex === 0) return requested;
  if (requested === 'for_sale' || requested === 'pokedex') return 'collection';
  return requested;
}

/**
 * Build N row objects ready for a bulk Supabase INSERT. Each row gets a
 * fresh UUID and a status computed via statusForCopy.
 *
 * @param base shared fields (no id, no status)
 * @param requestedStatus user's intent — only the first copy uses it as-is
 * @param count integer ≥1
 * @param idGenerator injected for testability (default: crypto.randomUUID)
 */
export function buildBatchRows(
  base: BatchRowBase,
  requestedStatus: CardStatus,
  count: number,
  idGenerator: () => string = () => crypto.randomUUID(),
): BatchRow[] {
  if (count < 1) return [];
  const rows: BatchRow[] = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      ...base,
      id: idGenerator(),
      status: statusForCopy(i, requestedStatus),
    });
  }
  return rows;
}
