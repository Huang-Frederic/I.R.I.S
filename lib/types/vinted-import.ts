import type { CardCondition, CardLanguage, EnrichedCard } from '@/lib/types';

/**
 * Shape utile du JSON Vinted /api/v2/users/{id}/items.
 * Champs ignorés : favourite_count, view_count, brand, size, etc.
 */
export interface VintedItem {
  id: number;
  title: string;
  description: string;
  price: { amount: string; currency_code: string };
  /** Unix seconds — date de mise en ligne sur Vinted. */
  created_at_ts: number;
  photos: Array<{
    id: number;
    full_size_url: string;
    url: string;
  }>;
  status_id?: number;
}

export interface ParsedListing {
  language: CardLanguage;
  setCode: string;
  setNumber: string;
  condition: CardCondition;
}

export interface ToImport {
  vintedItem: VintedItem;
  parsed: ParsedListing;
  enriched: EnrichedCard | null;
}

export type ImportFailureReason =
  | 'duplicate_for_sale'
  | 'listing_already_exists'
  | 'photo_unavailable'
  | 'storage_upload_failed'
  | 'unknown';

export interface ImportFailure {
  vintedItemId: number;
  reason: ImportFailureReason;
  /** Message brut pour debug UI (catch-all reason). */
  detail?: string;
}

export interface VintedCurl {
  userId: string;
  cookie: string;
  csrfToken: string | null;
}
