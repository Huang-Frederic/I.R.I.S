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
  vinted_listed_at: string | null;
  lot_id: string | null;
  date_added: string;
  date_sold: string | null;
  sold_price: number | null;
  notes: string | null;
  variant: string | null;
}

export interface Lot {
  id: string;
  /** Legacy column from initial scaffold — unused since Phase 3b1, may be null. */
  photo_url: string | null;
  created_at: string;

  // Phase 3b1 extensions
  name: string;
  language: CardLanguage | null;
  condition: CardCondition;
  extra_description: string | null;
  price: number | null;
  status: 'for_sale' | 'sold';
  date_sold: string | null;
  sold_price: number | null;
  vinted_listed_at: string | null;
  /** Array of Storage paths relative to the lot-photos bucket, e.g. ["{lot_id}/0.jpg"]. */
  photo_urls: string[];
  date_added: string;
}

export interface RarityRank {
  rarity: CardRarity;
  rank: number;
  label: string;
}

/* ----- OCR / enrichment payloads exchanged with the /api routes ----- */

/**
 * One word detected by Vision, with its position normalized to the page.
 * Coordinates are in [0, 1] where (0, 0) is the top-left corner of the image.
 */
export interface WordAnnotation {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export interface OcrResult {
  text: string;
  /** Page-level confidence from Google Vision, 0..1 */
  confidence: number;
  /** Per-word boxes — used by the smart extractors below. */
  words: WordAnnotation[];
  /** "<card>/<setSize>" pulled from the bottom-left region (where it's printed on a Pokémon card). */
  setNumberCandidate: { card: string; total: string; raw: string } | null;
  /** Set code (e.g. "SV11W") detected near the set number. */
  setCodeCandidate: string | null;

  // Optional, populated only when Gemini provides them (not by Vision fallback)
  pokemonNumber?: number | null;
  pokemonNameFr?: string | null;
  setName?: string | null;
  setNameFr?: string | null;
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
  /* Optional pricing — populated when the source (e.g. TCGdex) returns Cardmarket data. */
  cardmarket_id?: string | null;
  cm_price_low?: number | null;
  cm_price_trend?: number | null;
  cm_price_avg?: number | null;
}

export interface EnrichResult {
  bestMatch: EnrichedCard | null;
  /** Up to 10 alternatives the user can pick if the best match is wrong. */
  candidates: EnrichedCard[];
}
