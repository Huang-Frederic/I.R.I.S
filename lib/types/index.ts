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
export const UI_LANGUAGES = [
  'JP',
  'EN',
  'FR',
  'KO',
  'CN',
] as const satisfies readonly CardLanguage[];
export type UILanguage = (typeof UI_LANGUAGES)[number];

export type CardCondition = 'NM' | 'EX' | 'GD' | 'PL' | 'PO';

export type CardStatus = 'pokedex' | 'for_sale' | 'collection' | 'sold' | 'traded';

export type CardRarity = 'SAR' | 'AR' | 'SR' | 'CHR' | 'RR' | 'R_HOLO' | 'R' | 'UC' | 'C' | 'OTHER';

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
  /** When the card left via a trade (status='traded'). NULL otherwise. */
  traded_at: string | null;
  /** auth.users.id of the user who recorded the trade. Mirror of sold_by_user_id. */
  traded_by_user_id: string | null;
  /** Photo of the trade batch — same URL on every card of one bulk trade. */
  trade_photo_url: string | null;
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
  /** 'collection' = in Stock (same vocabulary as cards; the UI says "Stock"). */
  status: 'for_sale' | 'collection' | 'sold';
  /** Number of identical physical copies. Selling one splits a sold clone off the row. */
  quantity: number;
  date_sold: string | null;
  sold_price: number | null;
  /** auth.users.id of the user who marked this lot sold. NULL on lots sold before per-user attribution existed. */
  sold_by_user_id: string | null;
  /** Array of Storage paths relative to the lot-photos bucket, e.g. ["{lot_id}/0.jpg"]. */
  photo_urls: string[];
  date_added: string;
  /** Vinted catalog ID: 4875 = single card, 4879 = lot. Null for legacy rows (treated as lot). */
  catalog_id: number | null;
  /** Vinted brand ID. Null for legacy rows (treated as Pokémon). */
  brand_id: number | null;
  /** Vinted brand display name as sent to Vinted API. */
  brand_name: string | null;
  /** Display label used in title/description (e.g. "Riftbound"). Null for legacy rows. */
  brand_label: string | null;
  /** true = Lot de Cartes (catalog 4879), false = single Carte (catalog 4875). Null for legacy rows (treated as lot). */
  is_lot: boolean | null;
}

export interface RarityRank {
  rarity: CardRarity;
  rank: number;
  label: string;
}

export type StoreEventType =
  | 'league'
  | 'tournament'
  | 'prerelease'
  | 'league_cup'
  | 'league_challenge';

/** A shop event aggregated by the store-events scraper (see scripts/store-events/). */
export interface StoreEventRow {
  id: string;
  source: string;
  shop_name: string;
  city: string;
  title: string;
  event_type: StoreEventType | null;
  starts_at: string | null;
  ends_at: string | null;
  spots_left: number | null;
  url: string;
  price: number | null;
  external_id: string;
  scraped_at: string;
}

/* ----- Pokémon TCG Live — post-game analysis (see lib/ptcg/) ----- */

/** A card as the battle log names it: internal client id plus printed name. */
export interface PtcgCardRef {
  /** Client-internal id, e.g. `sv10_34`. Maps to TCGdex `sv10-034`. */
  id: string;
  name: string;
}

/** Gameplay reference data, cached from TCGdex into `ptcg_cards`. */
export interface PtcgCardRow {
  ptcgl_id: string;
  language: CardLanguage;
  tcgdex_id: string;
  set_code: string;
  set_number: string;
  name: string;
  /** `Pokémon` | `Dresseur` | `Énergie` */
  category: string;
  /** `Objet` | `Supporter` | `Stade` | `Outil Pokémon` — null for non-trainers. */
  trainer_type: string | null;
  stage: string | null;
  hp: number | null;
  types: string[] | null;
  weaknesses: { type: string; value: string }[] | null;
  retreat: number | null;
  abilities: { name: string; effect: string | null }[];
  attacks: { name: string; cost: string[]; damage: string | null; effect: string | null }[];
  /** Trainer card text. Null for Pokémon. */
  effect: string | null;
  image_url: string | null;
  fetched_at: string;
}

/**
 * One Pokémon in play. `uid` is assigned by the parser and stays stable across
 * evolutions — it is what lets us say "this Feurisson", not "a Feurisson".
 */
export interface PtcgPokemonState {
  uid: number;
  cardId: string;
  name: string;
  owner: string;
  zone: 'active' | 'bench';
  damage: number;
  /** Energies and tools currently attached. */
  attached: PtcgCardRef[];
  /** Evolution cards underneath, oldest first. */
  stack: PtcgCardRef[];
  placedTurn: number;
  evolvedTurn: number | null;
}

export interface PtcgPlayerState {
  active: PtcgPokemonState | null;
  bench: PtcgPokemonState[];
  /** Known cards. Only the exporting player's hand is visible in the log. */
  hand: PtcgCardRef[];
  /** Opponent hand size — the log gives counts, never names. */
  unknownHand: number;
  discard: PtcgCardRef[];
  prizesRemaining: number;
}

export interface PtcgGameState {
  turnNumber: number;
  activePlayer: string | null;
  stadium: { card: PtcgCardRef; owner: string } | null;
  winner: string | null;
  players: Record<string, PtcgPlayerState>;
}

/**
 * Recurring mistake categories. Closed vocabulary so that history can be
 * aggregated across games ("you skipped a once-per-turn ability in 7 of your
 * last 12 games") — that aggregate is the whole reason to keep a history.
 *
 * Populated today by the analysis step, not by code: which mistakes actually
 * recur is not yet known, so writing detectors would be guessing. Once enough
 * analyses exist, the frequent codes become the spec for automating them.
 */
export type PtcgMistakeCode =
  | 'ability_unused' // a once-per-turn ability was available and never used
  | 'bench_liability' // an ex was benched while the opponent needed ≤2 prizes
  | 'missed_lethal' // the attack fell short of a KO that was reachable
  | 'supporter_unplayed' // the turn ended without playing a Supporter
  | 'energy_unattached' // the turn ended without the energy attachment
  | 'discard_fuel_missed' // a discard cost could have fed a discard-counting attack
  | 'promote_misplay'; // the wrong Pokémon was promoted after a knockout

/** A row of `ptcg_games`. `state` and `validation` are parser output. */
export interface PtcgGameRow {
  id: string;
  user_id: string;
  played_at: string;
  me: string;
  opponent: string;
  result: 'win' | 'loss' | 'tie';
  /** Prizes *taken*, not remaining. */
  prizes_me: number;
  prizes_opponent: number;
  turns: number;
  my_archetype: string | null;
  opponent_archetype: string | null;
  /** ptcgl_id of the Pokémon that dealt the most damage — joins ptcg_cards. */
  my_key_card: string | null;
  opponent_key_card: string | null;
  /** 0–100, derived from the analysis at import. See lib/ptcg/score.ts. */
  play_score: number | null;
  raw_log: string;
  log_hash: string;
  parser_version: string;
  state: { snapshots: PtcgSnapshot[]; turns: PtcgTurnIndex[] };
  validation: PtcgValidationReport;
  created_at: string;
}

export interface PtcgSnapshot {
  /** 1-based line in the raw log. */
  line: number;
  turnNumber: number;
  event: Record<string, unknown>;
  state: PtcgGameState;
}

export interface PtcgTurnIndex {
  number: number;
  player: string | null;
  /** Indices into `snapshots`. */
  events: number[];
}

/**
 * Output of the damage oracle: the log's own "Analyse des dégâts" blocks
 * replayed against our reconstruction. A failing report must block any report —
 * a confident analysis built on a wrong state is worse than none.
 */
export interface PtcgValidationReport {
  ok: boolean;
  checks: { ok: boolean | null; kind: string; detail: string; expected?: unknown; got?: unknown }[];
}

/* ----- The analysis contract ----- */

export type PtcgSeverity = 'error' | 'warning' | 'good' | 'note';

export interface PtcgMoment {
  line: number;
  turn: number;
  severity: PtcgSeverity;
  category: PtcgMistakeCode | 'matchup' | 'sequencing' | 'resource';
  title: string;
  /** Short markdown. Rendered, never parsed. */
  body: string;
  /** Quantified cost when computable. */
  cost?: { damage?: number; prizes?: number };
  /** Log lines that back the claim. */
  evidence: number[];
}

/** A row of `ptcg_analyses`. */
export interface PtcgAnalysisRow {
  id: string;
  game_id: string;
  schema_version: number;
  source: 'rules' | 'llm' | 'manual';
  model: string | null;
  verdict: { summary: string; matchup?: string; deckAdvice?: string };
  moments: PtcgMoment[];
  /** Aggregated across games to surface recurring mistakes. */
  patterns: { code: PtcgMistakeCode; occurrences: number; severity: PtcgSeverity }[];
  checklist: string[];
  created_at: string;
}

/**
 * A self-contained game file: everything needed to store and replay one game,
 * in a single upload. Produced outside the app (parser + analysis), then handed
 * to /api/ptcg/games, which validates it before touching the database.
 *
 * Self-contained on purpose: the app never re-parses and never calls TCGdex on
 * the import path, so an upload either is accepted whole or is rejected whole.
 */
export interface PtcgBundle {
  bundleVersion: 1;
  generatedAt: string;
  game: {
    played_at: string;
    me: string;
    opponent: string;
    result: 'win' | 'loss' | 'tie';
    prizes_me: number;
    prizes_opponent: number;
    turns: number;
    my_archetype: string | null;
    opponent_archetype: string | null;
    raw_log: string;
    log_hash: string;
    parser_version: string;
    state: { snapshots: PtcgSnapshot[]; turns: PtcgTurnIndex[] };
    validation: PtcgValidationReport;
  };
  /** Gameplay data for every card seen, upserted into ptcg_cards. */
  cards: PtcgCardRow[];
  analysis: Pick<
    PtcgAnalysisRow,
    'schema_version' | 'source' | 'model' | 'verdict' | 'moments' | 'patterns' | 'checklist'
  >;
}

/**
 * What gets handed to the analysis step. Deliberately *not* the full snapshot
 * list: that is ~500 KB and mostly redundant. `available` is the important part
 * — what was possible and did not happen — because it cannot be re-derived
 * downstream without redoing the whole reconstruction.
 */
export interface PtcgDigest {
  meta: {
    gameId: string;
    playedAt: string;
    me: string;
    opponent: string;
    winner: string | null;
    prizesTaken: { me: number; opponent: number };
    turns: number;
  };
  /** Only the cards actually seen in this game. */
  cards: Record<string, PtcgCardRow>;
  turns: PtcgDigestTurn[];
  /** Validation must pass before a digest is handed out — see PtcgValidationReport. */
  validationOk: boolean;
}

export interface PtcgDigestTurn {
  n: number;
  player: 'me' | 'opponent';
  start: PtcgGameState;
  actions: { line: number; label: string }[];
  end: PtcgGameState;
  available: PtcgAvailability;
}

export interface PtcgAvailability {
  /**
   * Once-per-turn abilities in play that were never triggered this turn.
   *
   * `conditional` warns that the ability has a precondition in its text (e.g.
   * "if one of your Pokémon was Knocked Out during your opponent's last turn").
   * Those entries are NOT proof of a missed opportunity — the ability may
   * simply have been unusable. Read `effect` and check before reporting one.
   */
  unusedAbilities: {
    uid: number;
    card: string;
    ability: string;
    effect: string | null;
    conditional: boolean;
    /**
     * True when the ability searches the deck for a card of which all four
     * copies are already visible elsewhere. Triggering it would find nothing,
     * so leaving it unused is not a missed opportunity.
     */
    exhausted: boolean;
  }[];
  playableFromHand: string[];
  supporterPlayed: boolean;
  energyAttached: boolean;
  /** Best attack reachable this turn against the current active, if computable. */
  damageIfAttackNow: {
    move: string;
    total: number;
    targetEffectiveHp: number;
    targetDamage: number;
  } | null;
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
  vinted_listing_id: string | null;
  vinted_posted_at: string | null;
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
