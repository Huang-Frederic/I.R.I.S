/**
 * Domain types for I.R.I.S — mirror of the SQL enums and tables defined in
 * supabase/migrations/0001_initial_schema.sql (cf. context.md section 4).
 */

export type CardLanguage = 'JP' | 'EN' | 'FR' | 'DE' | 'IT' | 'ES' | 'KO' | 'PT' | 'ZH';

export type CardCondition = 'NM' | 'EX' | 'GD' | 'PL' | 'PO';

export type CardStatus = 'pokedex' | 'for_sale' | 'collection' | 'sold';

export type CardRarity =
  | 'SAR'
  | 'AR'
  | 'SR'
  | 'CHR'
  | 'RR'
  | 'R_HOLO'
  | 'R'
  | 'UC'
  | 'C'
  | 'OTHER';

export interface Card {
  id: string;
  pokemon_name: string;
  pokemon_number: number;
  card_name: string;
  card_id_tcg: string | null;
  set_name: string | null;
  set_code: string | null;
  set_number: string | null;
  language: CardLanguage;
  rarity: CardRarity;
  rarity_rank: number;
  condition: CardCondition;
  status: CardStatus;
  image_url: string | null;
  tcg_image_url: string | null;
  cardmarket_id: string | null;
  cm_price_low: number | null;
  cm_price_trend: number | null;
  cm_price_avg: number | null;
  suggested_price: number | null;
  cm_updated_at: string | null;
  lot_id: string | null;
  date_added: string;
  date_sold: string | null;
  sold_price: number | null;
  notes: string | null;
}

export interface Lot {
  id: string;
  photo_url: string | null;
  created_at: string;
}

export interface RarityRank {
  rarity: CardRarity;
  rank: number;
  label: string;
}

/* ----- OCR / enrichment payloads exchanged with the /api routes ----- */

export interface OcrResult {
  text: string;
  /** Page-level confidence from Google Vision, 0..1 */
  confidence: number;
  words: string[];
}

export interface EnrichedCard {
  card_id_tcg: string;
  card_name: string;
  pokemon_name: string;
  pokemon_number: number | null;
  set_name: string;
  set_code: string;
  set_number: string;
  rarity: CardRarity;
  tcg_image_url: string;
}

export interface EnrichResult {
  bestMatch: EnrichedCard | null;
  /** Up to 10 alternatives the user can pick if the best match is wrong. */
  candidates: EnrichedCard[];
}
