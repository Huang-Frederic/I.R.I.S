export interface Generation {
  id: string;
  label: string;
  start: number;
  end: number;
}

/**
 * National-Pokédex ranges per generation, used by the /pokedex filter bar.
 * Source: official Pokédex through gen 9 (Scarlet/Violet) — totals 1025 species.
 */
export const GENERATIONS: Generation[] = [
  { id: '1', label: 'Gen 1 (Kanto)', start: 1, end: 151 },
  { id: '2', label: 'Gen 2 (Johto)', start: 152, end: 251 },
  { id: '3', label: 'Gen 3 (Hoenn)', start: 252, end: 386 },
  { id: '4', label: 'Gen 4 (Sinnoh)', start: 387, end: 493 },
  { id: '5', label: 'Gen 5 (Unys)', start: 494, end: 649 },
  { id: '6', label: 'Gen 6 (Kalos)', start: 650, end: 721 },
  { id: '7', label: 'Gen 7 (Alola)', start: 722, end: 809 },
  { id: '8', label: 'Gen 8 (Galar)', start: 810, end: 905 },
  { id: '9', label: 'Gen 9 (Paldea)', start: 906, end: 1025 },
];
