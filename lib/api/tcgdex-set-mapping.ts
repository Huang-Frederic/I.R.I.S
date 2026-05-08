import 'server-only';
import type { CardLanguage } from '@/lib/types';
import { toTCGdexLang, type TCGdexLang } from './tcgdex';

const BASE = 'https://api.tcgdex.net/v2';
// Aggressive timeout — TCGdex's /sets endpoint normally returns in <1s.
// If it's slow, the whole UI blocks (single-card refresh) so we'd rather
// fail fast and let the caller fall through.
const TIMEOUT_MS = 5_000;

interface TCGdexSet {
  id: string;
  name: string;
  cardCount?: { total?: number; official?: number };
}

interface SetIndex {
  byName: Map<string, string>; // lowercased name → id
  byTotal: Map<number, string[]>; // cardCount.total → list of ids (may collide)
  byId: Map<string, string>; // id → original-cased name (for reverse lookup)
}

const cache = new Map<TCGdexLang, SetIndex>();
/** Languages whose /sets endpoint timed out / errored in this process.
 *  Subsequent calls fail-fast instead of re-attempting (the failure mode is
 *  usually network-level and persistent — the second attempt eats another
 *  TIMEOUT_MS for the same negative result). Cleared on process restart. */
const failedLangs = new Set<TCGdexLang>();

async function loadSetsForLang(lang: TCGdexLang): Promise<SetIndex> {
  const cached = cache.get(lang);
  if (cached) return cached;
  if (failedLangs.has(lang)) {
    throw new Error(`tcgdex sets ${lang}: skipped (previous failure cached for this process)`);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/${lang}/sets`, { signal: ctrl.signal });
    if (!res.ok) {
      failedLangs.add(lang);
      throw new Error(`tcgdex sets ${res.status}`);
    }
    const sets = (await res.json()) as TCGdexSet[];
    const idx: SetIndex = { byName: new Map(), byTotal: new Map(), byId: new Map() };
    for (const s of sets) {
      idx.byName.set(s.name.toLowerCase().trim(), s.id);
      idx.byId.set(s.id, s.name);
      const total = s.cardCount?.total;
      if (typeof total === 'number') {
        const list = idx.byTotal.get(total) ?? [];
        list.push(s.id);
        idx.byTotal.set(total, list);
      }
    }
    cache.set(lang, idx);
    return idx;
  } catch (err) {
    failedLangs.add(lang);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Strip a trailing "/total" from a set_number.
 *   "171/226" → "171"
 *   "171"     → "171"
 *   null/empty → null
 */
function normalizeSetNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const slashIdx = trimmed.indexOf('/');
  return slashIdx === -1 ? trimmed : trimmed.slice(0, slashIdx);
}

/**
 * Try to extract the set total from a "X/Y" string (returns Y as number).
 * Returns null when the format doesn't include a total.
 */
function extractSetTotal(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const slashIdx = raw.indexOf('/');
  if (slashIdx === -1) return null;
  const tail = raw.slice(slashIdx + 1).trim();
  const n = parseInt(tail, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Resolve the TCGdex set id from our card's identifying fields.
 *
 *   1. Try matching set_name (lowercased) against the EN set index — the
 *      LimitlessTCG catalog stores set names in English regardless of card
 *      language ("Twilight Masquerade" even on a FR card), so EN nearly
 *      always wins here.
 *   2. Fall back to matching against the card's own language (works for the
 *      rare case where the catalog stored the localised name).
 *   3. Final fall back: match by `set_total` (extracted from "171/226" → 226)
 *      against the EN index. Language-agnostic and resilient to set-name
 *      translation gaps. Returns null when multiple sets share the same total
 *      (can't disambiguate).
 *
 * The returned set_id is canonical (e.g. "sv06") and works in any TCGdex
 * language for the subsequent /cards/{id} call.
 */
export async function tcgdexSetIdFromName(
  setName: string | null,
  language: CardLanguage,
  setTotal?: number | null,
): Promise<string | null> {
  const cardLang = toTCGdexLang(language);
  let enIdx: SetIndex | null = null;
  let langIdx: SetIndex | null = null;
  try {
    enIdx = await loadSetsForLang('en');
  } catch (err) {
    console.warn(`[tcgdex-set-mapping] EN sets fetch failed:`, err);
  }
  if (cardLang !== 'en') {
    try {
      langIdx = await loadSetsForLang(cardLang);
    } catch (err) {
      console.warn(`[tcgdex-set-mapping] ${language} sets fetch failed:`, err);
    }
  }

  const cleanedName = setName?.toLowerCase().trim() ?? '';

  if (cleanedName) {
    const byEn = enIdx?.byName.get(cleanedName);
    if (byEn) return byEn;
    const byLang = langIdx?.byName.get(cleanedName);
    if (byLang) return byLang;
  }

  if (typeof setTotal === 'number' && setTotal > 0) {
    const enCandidates = enIdx?.byTotal.get(setTotal) ?? [];
    if (enCandidates.length === 1) return enCandidates[0];
    const langCandidates = langIdx?.byTotal.get(setTotal) ?? [];
    if (langCandidates.length === 1) return langCandidates[0];
    if (enCandidates.length > 1 || langCandidates.length > 1) {
      console.warn(
        `[tcgdex-set-mapping] total=${setTotal} ambiguous: en=[${enCandidates.join(',')}] ${language}=[${langCandidates.join(',')}]`,
      );
    }
  }

  console.warn(
    `[tcgdex-set-mapping] no match: name="${setName ?? ''}" lang=${language} total=${setTotal ?? '?'}`,
  );
  return null;
}

/**
 * Build the TCGdex card ID from our card row.
 * Handles "171/226" set_number formats by stripping the total.
 */
export async function tcgdexCardId(
  setName: string | null,
  setNumber: string | null,
  language: CardLanguage,
): Promise<string | null> {
  const cleanedNumber = normalizeSetNumber(setNumber);
  if (!cleanedNumber) return null;
  const total = extractSetTotal(setNumber);
  const setId = await tcgdexSetIdFromName(setName, language, total);
  if (!setId) return null;
  return `${setId}-${cleanedNumber}`;
}

/**
 * Translate a set name from its source language (typically EN — what our
 * catalog stores) to the target language. Used by the Cardmarket dump
 * lookup to bridge "Twilight Masquerade" (our DB) → "Mascarade Crépusculaire"
 * (Cardmarket FR locale).
 *
 * Returns null when either lookup fails. Cached after first call per language.
 */
export async function localizedSetName(
  setName: string | null,
  fromLanguage: CardLanguage,
  toLanguage: CardLanguage,
): Promise<string | null> {
  if (!setName) return null;
  if (fromLanguage === toLanguage) return setName;

  const fromLang = toTCGdexLang(fromLanguage);
  const toLang = toTCGdexLang(toLanguage);

  let fromIdx: SetIndex;
  let toIdx: SetIndex;
  try {
    [fromIdx, toIdx] = await Promise.all([loadSetsForLang(fromLang), loadSetsForLang(toLang)]);
  } catch (err) {
    console.warn(`[tcgdex-set-mapping] localizedSetName fetch failed:`, err);
    return null;
  }

  const setId = fromIdx.byName.get(setName.toLowerCase().trim());
  if (!setId) return null;
  return toIdx.byId.get(setId) ?? null;
}

/** Test-only: clear the in-memory cache so tests start with a clean slate. */
export function _resetCacheForTests(): void {
  cache.clear();
  failedLangs.clear();
}
