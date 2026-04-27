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
