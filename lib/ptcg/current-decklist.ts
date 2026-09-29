/**
 * Fred's current, finalized Insolourdo / Méga-Lockpin-ex decklist — the only
 * deck he tracks in Stats right now. Games logged while the list was still
 * being tweaked carry cards/Pokémon that got cut since; this whitelist hides
 * that leftover noise from the Stats tables (cards, attackers, attachments,
 * recoveries, starters) without touching the underlying game logs.
 *
 * This is a UI-layer filter, not a game-stats.ts concern — the extraction
 * engine stays deck-agnostic. Update this list (or ask to have it updated)
 * whenever the decklist changes.
 */
const DECKLIST_CARD_NAMES = [
  // Pokémon
  'Insolourdo',
  'Limonde',
  'Motisma Hélice',
  'Laporeille',
  'Sulfura',
  'Méga-Lockpin-ex',
  'Shaymin',
  'Mélofée-ex de Lilie',
  'Deusolourdo',
  // Dresseur
  'Pokématos 3.0',
  'Cage de Combat',
  'Hyper Ball',
  'Civière Nocturne',
  'Détermination de Lilie',
  'Ordres du Boss',
  'Ballon',
  'Poffin Copain-Copain',
  'Ludvina',
  'Carton Rouge Spécial',
  'Poké Registre',
  'Compassion de Timmy',
  'Mine de Nuit',
  // Énergie
  'Énergie Brume',
  'Énergie Enrichissante',
  'Énergie Prisme',
];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const NORMALIZED_NAMES = new Set(DECKLIST_CARD_NAMES.map(norm));

/** True when `name` (any accenting/casing) is a card in the current decklist. */
export function isInCurrentDecklist(name: string): boolean {
  return NORMALIZED_NAMES.has(norm(name));
}
