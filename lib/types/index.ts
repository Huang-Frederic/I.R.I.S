/**
 * Domain types for I.R.I.S — mirror of the SQL enums and tables defined in
 * supabase/migrations/0001_initial_schema.sql (cf. context.md section 4).
 */

/**
 * All language codes the DB enum supports, in their canonical form. Note:
 *   - 'CN' is preferred over 'ZH' (display + new inserts use CN).
 *   - 'ZH' is kept for backward-compat with existing rows; never written by
 *     the app post-2026-05-04 migration.
 *   - 'DE', 'IT', 'ES', 'PT' are accepted by the type/DB but UI hides them
 *     (per user collection scope: JP/EN/FR/KO/CN only).
 */
export type CardLanguage = 'JP' | 'EN' | 'FR' | 'DE' | 'IT' | 'ES' | 'KO' | 'PT' | 'ZH' | 'CN';

/** UI-facing subset — what the user can pick in dropdowns. */
export const UI_LANGUAGES = ['JP', 'EN', 'FR', 'KO', 'CN'] as const satisfies readonly CardLanguage[];
export type UILanguage = (typeof UI_LANGUAGES)[number];

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
  /** Null for non-Pokémon cards (Trainers/Energies/Stadium): they have no
   *  separate "Pokémon name" — the card_name suffices. The catalog used to
   *  copy card_name into pokemon_name as a NOT NULL workaround; this is now
   *  blanked at enrich time. */
  pokemon_name: string | null;
  pokemon_name_ocr?: string | null;
  card_name_ocr?: string | null;
  set_name_ja?: string | null;
  /** National dex number 1..1025, OR null for non-Pokémon cards
   *  (Trainers, Energies, Stadium, Tools). Cards with null pokemon_number
   *  cannot be placed in the Pokédex slot. */
  pokemon_number: number | null;
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
  cardmarket_url: string | null;
  cm_price_low: number | null;
  cm_price_trend: number | null;
  cm_price_avg: number | null;
  suggested_price: number | null;
  cm_updated_at: string | null;
  lot_id: string | null;
  date_added: string;
  date_sold: string | null;
  sold_price: number | null;
  /** auth.users.id of the user who marked this card sold.
   * NULL for items sold before per-user attribution existed, or never sold. */
  sold_by_user_id: string | null;
  notes: string | null;
  variant: string | null;
}

export interface Lot {
  id: string;
  /** Legacy single-photo column — superseded by `photo_urls` (jsonb array). May be null on old rows. */
  photo_url: string | null;
  created_at: string;

  name: string;
  language: CardLanguage | null;
  condition: CardCondition;
  extra_description: string | null;
  price: number | null;
  status: 'for_sale' | 'sold';
  date_sold: string | null;
  sold_price: number | null;
  /** auth.users.id of the user who marked this lot sold. NULL on lots sold before per-user attribution existed. */
  sold_by_user_id: string | null;
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

/**
 * Gemini token usage + EUR cost (cf. lib/api/gemini-vision.ts).
 * Mirrored here to avoid server-only import in client code.
 */
export interface GeminiUsage {
  tokens_in: number;
  tokens_out: number;
  /** Rough estimate (tokens_in − PROMPT_TOKEN_ESTIMATE). Imprecise — see GeminiUsage in lib/api/gemini-vision.ts. */
  tokens_image_est: number;
  cost_eur: number;
}

export interface OcrResult {
  text: string;
  /** Page-level confidence from Google Vision, 0..1 */
  confidence: number;
  /** Per-word boxes — used by the smart extractors below. */
  words: WordAnnotation[];
  /** "<card>/<setSize>" pulled from the bottom-left region.
   *  card may be null when Gemini detects a TG/GG/SV subseries — the picker
   *  lookup handles those by name, not by number. */
  setNumberCandidate: { card: string | null; total: string; raw: string } | null;
  /** Set abbreviation printed on the card (e.g. "BRS", "LOR", "BKR").
   *  This IS the set_prefix used by the enrich pipeline — same field, kept
   *  the legacy name to avoid churning every consumer. */
  setCodeCandidate: string | null;

  // Optional, populated only when Gemini provides them (not by Vision fallback)
  pokemonNumber?: number | null;
  pokemonNameFr?: string | null;
  /** English species name. Used by enrich Strategy 1 to query
   *  cardmarket_products.card_prefix which is always English. */
  pokemonNameEn?: string | null;
  /** Full French card name (incl. suffixes for Pokémon, OR Trainer/Energy
   *  translation). When set, takes precedence over the deriveCardNameFr
   *  fallback that just appends a suffix to pokemonNameFr. */
  cardNameFr?: string | null;

  /**
   * Language detected by Gemini (the structured `language` field from the
   * extraction). Authoritative when present — frontend should NOT fall back to
   * regex sniffing of `text` which only distinguishes JP from "not JP".
   */
  language?: CardLanguage;

  // Raw card identity from Gemini — used by enrich Strategy 1 (cardmarket
  // picker by name) and Strategy 3 (Gemini-only fallback) when no cardmarket
  // match is found, so the form can pre-fill these fields instead of forcing
  // the user to re-type them.
  cardName?: string | null;
  pokemonName?: string | null;
  rarity?: string | null;

  /**
   * Illustrator credit printed at the bottom of the card. Displayed in the OCR
   * snippet to give the user a unique disambiguation signal when set_code is
   * unclear (e.g. old cards with no printed code).
   */
  illustrator?: string | null;

  /**
   * Gemini token usage + EUR cost. Present when Gemini was reached, even when
   * its extraction failed (parse error, incomplete payload) and Vision had to
   * pick up the slack — so the caller can still attribute the cost.
   */
  _usage?: GeminiUsage;

  /**
   * Which OCR engine actually produced the values above. 'gemini' = Gemini
   * extraction succeeded. 'vision' = Vision fallback was used (Gemini either
   * never responded or its parse failed). Absent only on legacy/test responses.
   */
  _engine?: 'gemini' | 'vision';
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

/** Common shape for both card_listings and lot_listings rows. */
export interface BaseListing {
  user_id: string;
  listed_at: string;
}

export interface CardListing extends BaseListing {
  card_id: string;
}

export interface LotListing extends BaseListing {
  lot_id: string;
}

export interface UserProfile {
  user_id: string;
  display_name: string;
}

/** Card hydrated avec ses card_listings (chargés en parallèle côté server). */
export interface CardWithListings extends Card {
  listings: CardListing[];
}

/** Lot hydrated avec ses lot_listings. */
export interface LotWithListings extends Lot {
  listings: LotListing[];
}
