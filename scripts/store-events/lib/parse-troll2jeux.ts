/**
 * Parse Troll2Jeux's rendered calendar. It's a JS-rendered monthly grid; each
 * day cell may carry event lines like "18:00 | Ligue Pokémon". The month/year
 * come from the header ("2026 Juillet") so no year inference is needed.
 *
 * Pure + testable — the extractor renders the page and feeds the header + grid
 * lines here.
 */
const FR_MONTHS: Record<string, number> = {
  janvier: 1, 'février': 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, 'août': 8, aout: 8, septembre: 9, octobre: 10, novembre: 11,
  'décembre': 12, decembre: 12,
};

const DAY = /^(\d{1,2})$/;
const EVENT = /^(\d{1,2}):(\d{2})\s*\|\s*(.+)$/;

/** "2026 Juillet" → { year, month }. */
export function parseTroll2jeuxHeader(header: string): { year: number; month: number } | null {
  const m = header.match(/(\d{4})\s+([A-Za-zéûôà]+)/);
  if (!m) return null;
  const month = FR_MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  return { year: Number(m[1]), month };
}

export interface RawTrollEvent {
  day: number;
  hh: number;
  mm: number;
  name: string;
}

export function parseTroll2jeuxEvents(gridLines: string[]): RawTrollEvent[] {
  const out: RawTrollEvent[] = [];
  let day = 0;
  for (const line of gridLines) {
    const d = line.match(DAY);
    if (d) {
      day = Number(d[1]);
      continue;
    }
    const e = line.match(EVENT);
    if (e && day) {
      out.push({ day, hh: Number(e[1]), mm: Number(e[2]), name: e[3].trim() });
    }
  }
  return out;
}
