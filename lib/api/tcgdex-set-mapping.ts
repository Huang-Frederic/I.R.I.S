import 'server-only';
import type { CardLanguage } from '@/lib/types';
import { toTCGdexLang, type TCGdexLang } from './tcgdex';

const BASE = 'https://api.tcgdex.net/v2';
const TIMEOUT_MS = 10_000;

interface TCGdexSet {
  id: string;
  name: string;
  cardCount?: { total?: number; official?: number };
}

/**
 * Cache per (TCGdex language) of all set names → set IDs. Built lazily on first
 * call per language, kept in-memory until process restart. ~50-100 sets per
 * language; trivial RAM cost.
 */
const cache = new Map<TCGdexLang, Map<string, string>>();

async function loadSetsForLang(lang: TCGdexLang): Promise<Map<string, string>> {
  const cached = cache.get(lang);
  if (cached) return cached;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/${lang}/sets`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`tcgdex sets ${res.status}`);
    const sets = (await res.json()) as TCGdexSet[];
    const map = new Map<string, string>();
    for (const s of sets) {
      // Index by lowercase name for case-insensitive match
      map.set(s.name.toLowerCase().trim(), s.id);
    }
    cache.set(lang, map);
    return map;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Translate (set_name, language) → TCGdex set ID. Returns null on no match
 * (unknown set, network failure, etc.). Caller handles null gracefully.
 */
export async function tcgdexSetIdFromName(
  setName: string | null,
  language: CardLanguage,
): Promise<string | null> {
  if (!setName) return null;
  const lang = toTCGdexLang(language);
  try {
    const map = await loadSetsForLang(lang);
    return map.get(setName.toLowerCase().trim()) ?? null;
  } catch (err) {
    console.warn(`[tcgdex-set-mapping] lookup failed for ${language}/${setName}:`, err);
    return null;
  }
}

/**
 * Build the TCGdex card ID from our card row:
 *   tcgdex_set_id-set_number (e.g., 'sv06-171')
 * Returns null when set name doesn't match any TCGdex set.
 */
export async function tcgdexCardId(
  setName: string | null,
  setNumber: string | null,
  language: CardLanguage,
): Promise<string | null> {
  if (!setNumber) return null;
  const setId = await tcgdexSetIdFromName(setName, language);
  if (!setId) return null;
  return `${setId}-${setNumber}`;
}

/** Test-only: clear the in-memory cache so tests start with a clean slate. */
export function _resetCacheForTests(): void {
  cache.clear();
}
