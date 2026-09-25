/**
 * Parses a PTCG Live decklist export (paste-in for Drill profiles) and the
 * inverse: reconstructs a re-parseable decklist text from resolved
 * DrillCards, used to prefill the edit form's textarea.
 *
 * Export shape (French client):
 *   Pokémon : 13
 *   3 Weedle CRI 1
 *   ...
 *
 *   Dresseur : 15
 *   ...
 *
 *   Énergie : 1
 *   5 Basic {G} Energy MEE 1
 *
 *   Total de cartes : 60
 *
 * Card lines are `<count> <name> <SET> <number>`. The same (SET, number)
 * can appear on more than one line (PTCG Live sometimes splits a single
 * card across two export lines) — those are merged by summing counts.
 */
import type { DrillCard, DrillCategory } from '@/lib/types';

export interface ParsedDecklistLine {
  name: string;
  setCode: string;
  setNumber: string;
  count: number;
  category: DrillCategory;
}

const HEADER_CATEGORY: Record<string, DrillCategory> = {
  'Pokémon': 'poke',
  'Dresseur': 'trainer',
  'Énergie': 'energy',
};

const HEADER_RE = /^(Pokémon|Dresseur|Énergie)\s*:\s*\d+$/;
const FOOTER_RE = /^Total de cartes\s*:/;
// Set code allows an optional hyphenated subset suffix (e.g. "LOR-TG" for a
// Lost Origin Trainer Gallery print, "CRZ-GG" for Galarian Gallery) — without
// it, a line for one of these prints doesn't match at all and is silently
// dropped instead of at least reaching the "unresolved card" fallback.
const LINE_RE = /^(\d+)\s+(.+?)\s+([A-Z]{2,5}(?:-[A-Z]{1,4})?)\s+(\d+)$/;

export function parseDecklist(text: string): ParsedDecklistLine[] {
  const merged = new Map<string, ParsedDecklistLine>();
  let category: DrillCategory | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || FOOTER_RE.test(line)) continue;

    const header = line.match(HEADER_RE);
    if (header) {
      category = HEADER_CATEGORY[header[1]];
      continue;
    }

    if (!category) continue; // stray line before any section header
    const m = line.match(LINE_RE);
    if (!m) continue;

    const [, countStr, name, setCode, setNumber] = m;
    const key = `${setCode}-${setNumber}`;
    const count = Number(countStr);
    const existing = merged.get(key);
    if (existing) {
      existing.count += count;
    } else {
      merged.set(key, { name: name.trim(), setCode, setNumber, count, category });
    }
  }

  return [...merged.values()];
}

const CATEGORY_HEADER: Record<DrillCategory, string> = {
  poke: 'Pokémon',
  trainer: 'Dresseur',
  energy: 'Énergie',
};
const CATEGORY_ORDER: DrillCategory[] = ['poke', 'trainer', 'energy'];

/** Inverse of parseDecklist: rebuilds a decklist text from resolved cards,
 *  used to prefill the edit-profile textarea. Round-trips through
 *  parseDecklist to the same (setCode, setNumber, count) triples. */
export function decklistTextFromCards(cards: DrillCard[]): string {
  const byCategory = new Map<DrillCategory, DrillCard[]>();
  for (const c of cards) {
    const list = byCategory.get(c.category) ?? [];
    list.push(c);
    byCategory.set(c.category, list);
  }

  const sections: string[] = [];
  for (const category of CATEGORY_ORDER) {
    const list = byCategory.get(category);
    if (!list || list.length === 0) continue;
    const total = list.reduce((sum, c) => sum + c.count, 0);
    const lines = list.map((c) => {
      // Split on the LAST hyphen, not every hyphen — a hyphenated subset
      // code (e.g. "LOR-TG-24") would otherwise split into 3 pieces and
      // silently corrupt back into the wrong setCode/setNumber pair.
      const splitAt = c.id.lastIndexOf('-');
      const setCode = c.id.slice(0, splitAt);
      const setNumber = c.id.slice(splitAt + 1);
      return `${c.count} ${c.name} ${setCode} ${setNumber}`;
    });
    sections.push(`${CATEGORY_HEADER[category]} : ${total}\n${lines.join('\n')}`);
  }
  return sections.join('\n\n');
}
