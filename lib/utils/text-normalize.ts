// Search-oriented text normalization. Used for case- and accent-insensitive
// substring matching in list filters (Stock, Pokédex). Strips combining
// diacritics via NFD decomposition and lowercases.
//
// NOT for Cardmarket name matching — that needs additional steps (HTML decode,
// whitespace collapse) and lives in lib/api/cardmarket-pricing.ts:normalize().

export function normalizeForSearch(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}
