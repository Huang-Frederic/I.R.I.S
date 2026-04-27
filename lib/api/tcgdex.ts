import 'server-only';
import type { CardLanguage, CardRarity, EnrichedCard } from '@/lib/types';

const BASE = 'https://api.tcgdex.net/v2';

/** TCGdex's two-letter language codes — superset of what we expose in the UI. */
export type TCGdexLang = 'ja' | 'en' | 'fr' | 'de' | 'it' | 'es' | 'ko' | 'pt' | 'zh-tw';

/** Map our card_language enum → the catalog TCGdex actually serves. */
export function toTCGdexLang(lang: CardLanguage): TCGdexLang {
  switch (lang) {
    case 'JP':
      return 'ja';
    case 'EN':
      return 'en';
    case 'FR':
      return 'fr';
    case 'DE':
      return 'de';
    case 'IT':
      return 'it';
    case 'ES':
      return 'es';
    case 'KO':
      return 'ko';
    case 'PT':
      return 'pt';
    case 'ZH':
      return 'zh-tw';
  }
}

interface TCGdexCardmarketPricing {
  updated?: string;
  unit?: string;
  idProduct?: number;
  avg?: number;
  low?: number;
  trend?: number;
  avg1?: number;
  avg7?: number;
  avg30?: number;
  'avg-holo'?: number | null;
  'low-holo'?: number | null;
  'trend-holo'?: number | null;
}

export interface TCGdexCard {
  id: string;
  localId: string;
  name: string;
  illustrator?: string;
  rarity?: string;
  hp?: number;
  category?: string;
  stage?: string;
  description?: string;
  dexId?: number[];
  image?: string;
  set: {
    id: string;
    name: string;
    cardCount?: { official?: number; total?: number };
    logo?: string;
    symbol?: string;
  };
  pricing?: {
    cardmarket?: TCGdexCardmarketPricing | null;
    tcgplayer?: unknown;
  };
}

/**
 * TCGdex returns rarity in English regardless of card language. We map to our
 * card_rarity enum; anything unknown falls through to OTHER so the user can
 * override manually. Includes the modern Sword&Shield / Scarlet&Violet
 * "Illustration rare" / "Special illustration rare" terms not present in the
 * older pokemontcg.io vocabulary.
 */
const RARITY_MAP: Record<string, CardRarity> = {
  Common: 'C',
  Uncommon: 'UC',
  Rare: 'R',
  'Rare Holo': 'R_HOLO',
  'Holo Rare': 'R_HOLO',
  'Rare Holo V': 'R_HOLO',
  'Rare Holo VMAX': 'R_HOLO',
  'Rare Holo VSTAR': 'R_HOLO',
  'Trainer Gallery Holo Rare': 'R_HOLO',
  'Double rare': 'RR',
  'Double Rare': 'RR',
  'Ultra Rare': 'SR',
  'Shiny rare': 'SR',
  'Shiny Ultra Rare': 'SR',
  'Illustration rare': 'AR',
  'Illustration Rare': 'AR',
  'Special illustration rare': 'SAR',
  'Special Illustration Rare': 'SAR',
  'Hyper rare': 'SAR',
  'Hyper Rare': 'SAR',
};

export function mapRarity(rarity: string | undefined): CardRarity {
  if (!rarity) return 'OTHER';
  return RARITY_MAP[rarity] ?? 'OTHER';
}

/**
 * Trim trainer/EX/V suffixes to recover the species name. Mostly a no-op for
 * Japanese cards (the JP species name doesn't carry an English suffix), and a
 * pragmatic strip for English/French/etc.
 */
export function extractPokemonName(cardName: string): string {
  return cardName
    .replace(/\s*(ex|EX|GX|V|VMAX|VSTAR|V-?UNION|BREAK|LEGEND)\s*$/i, '')
    .trim();
}

/**
 * TCGdex's `image` is a base URL the caller has to complete with quality+ext.
 * "high" + ".png" gets us the printable-quality artwork; fallback "" lets
 * downstream code skip the field cleanly when the catalog has no image
 * (common for some JP printings).
 */
function buildImageUrl(image: string | undefined): string {
  if (!image) return '';
  return `${image}/high.png`;
}

/**
 * Convert a raw TCGdex card payload to the EnrichedCard shape the form prefills
 * from. Pulls Cardmarket pricing inline if present so the user gets prices
 * before the daily cron runs.
 */
export function toEnrichedCard(card: TCGdexCard): EnrichedCard {
  const total = card.set.cardCount?.official ?? card.set.cardCount?.total ?? '';
  const cm = card.pricing?.cardmarket;
  return {
    card_id_tcg: card.id,
    card_name: card.name,
    pokemon_name: extractPokemonName(card.name),
    pokemon_number: card.dexId?.[0] ?? null,
    set_name: card.set.name,
    set_code: card.set.id,
    set_number: total !== '' ? `${card.localId}/${total}` : card.localId,
    rarity: mapRarity(card.rarity),
    tcg_image_url: buildImageUrl(card.image),
    cardmarket_id: cm?.idProduct != null ? String(cm.idProduct) : null,
    cm_price_low: cm?.low ?? null,
    cm_price_trend: cm?.trend ?? null,
    cm_price_avg: cm?.avg ?? null,
  };
}

/**
 * Direct ID lookup — the high-precision path for the "Re-rechercher TCG" button
 * once the user has typed a set code and local id. Returns null on 404 so
 * callers can fall back to a different strategy without a try/catch.
 */
export async function lookupById(
  setCode: string,
  localId: string,
  lang: TCGdexLang = 'en',
): Promise<TCGdexCard | null> {
  const url = `${BASE}/${lang}/cards/${encodeURIComponent(setCode)}-${encodeURIComponent(localId)}`;
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`TCGdex ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as TCGdexCard;
}

/* ===== Set catalog cache + total-based card resolution =====
 *
 * The OCR can't reliably read the set code on a stylized Pokémon card (we've
 * seen "sv1W" come back as "Miyanose", "wilw", etc). But the set total in
 * "<card>/<setSize>" is short, printed in plain digits, and Vision usually
 * gets it right.
 *
 * Idea: cache TCGdex's full set list per language, then "given total = 86,
 * which set is this?" narrows ~150 sets down to a handful. We try
 * `<setId>-<localId>` for each candidate; the first 200 OK is our match.
 *
 * In-memory cache survives the lifetime of the server process. 6 h TTL is
 * comfortable since the set catalog only changes when a new set ships.
 */

interface TCGdexSetSummary {
  id: string;
  name: string;
  cardCount?: { total?: number; official?: number };
}

const SETS_CACHE = new Map<TCGdexLang, { fetchedAt: number; sets: TCGdexSetSummary[] }>();
const SETS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export async function listSets(lang: TCGdexLang): Promise<TCGdexSetSummary[]> {
  const cached = SETS_CACHE.get(lang);
  if (cached && Date.now() - cached.fetchedAt < SETS_CACHE_TTL_MS) {
    return cached.sets;
  }
  const url = `${BASE}/${lang}/sets`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`TCGdex sets ${response.status}: ${await response.text()}`);
  }
  const sets = (await response.json()) as TCGdexSetSummary[];
  SETS_CACHE.set(lang, { fetchedAt: Date.now(), sets });
  return sets;
}

/**
 * Find a card knowing only the printed denominator (set total) and the local
 * id within the set. Robust to set-code OCR errors.
 *
 * Returns the first set whose lookup succeeds. In the rare event two sets in
 * the same language have the same total AND the same localId, this is a
 * coin-flip — but the alternative is asking the user, which we already do via
 * the manual "Re-rechercher" button if they need to override.
 */
export async function findCardsByTotalAndLocalId(
  total: number,
  localId: string,
  lang: TCGdexLang,
): Promise<TCGdexCard[]> {
  const sets = await listSets(lang);

  const lookupAll = async (candidates: TCGdexSetSummary[]): Promise<TCGdexCard[]> => {
    const results = await Promise.all(
      candidates.map((s) => lookupById(s.id, localId, lang).catch(() => null)),
    );
    return results.filter((c): c is TCGdexCard => c !== null);
  };

  // Strict: printed denominator matches official or total exactly.
  const strict = sets.filter(
    (s) => s.cardCount?.official === total || s.cardCount?.total === total,
  );
  const strictHits = strict.length > 0 ? await lookupAll(strict) : [];
  if (strictHits.length > 0) return strictHits;

  // Loose: JP cards print the base-set size as denominator (e.g. "111/086")
  // while TCGdex reports the full count including secret rares (e.g. 174).
  // Use the localId as a lower bound — the set must have at least that many
  // cards. TCGdex returns sets chronologically, so reversing tries newer
  // (more likely) sets first.
  const localIdNum = Number(localId);
  const minCards = Number.isFinite(localIdNum) ? Math.max(localIdNum, total + 1) : total + 1;
  const loose = sets
    .filter((s) => (s.cardCount?.official ?? 0) >= minCards)
    .reverse();

  if (loose.length === 0) return [];

  return lookupAll(loose.slice(0, 20));
}

/** Test-only: drop the in-memory cache so unit tests get a deterministic state. */
export function _clearSetsCache(): void {
  SETS_CACHE.clear();
}
