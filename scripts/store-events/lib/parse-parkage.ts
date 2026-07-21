/**
 * Parse Parkage's rendered events text. Parkage is a Next.js/RSC platform (no
 * clean API from the client), but the visible text is a stable sequence in
 * English:
 *
 *   TUESDAY 21 JULY        ← date header (weekday day MONTH, no year)
 *   Pokémon                ← game label
 *   18:30                  ← time
 *   Construit BO1          ← name
 *   10,00 €                ← price
 *   0 ticket available     ← tickets
 *
 * Pure + testable. The extractor turns raw records into StoreEvent (year
 * inference, classify, url).
 */
const EN_MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
};

const DATE_HEADER = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(\d{1,2})\s+([a-z]+)/i;
const TIME = /^(\d{1,2}):(\d{2})$/;

export interface RawParkageEvent {
  day: number;
  month: number; // 1-12
  hh: number;
  mm: number;
  name: string;
  priceText: string | null;
  /** Remaining tickets ("13 tickets available" → 13), or null. */
  spotsLeft: number | null;
}

export function parseParkageEvents(lines: string[]): RawParkageEvent[] {
  const out: RawParkageEvent[] = [];
  let day = 0;
  let month = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const dh = lines[i].match(DATE_HEADER);
    if (dh) {
      day = Number(dh[2]);
      month = EN_MONTHS[dh[3].toLowerCase()] ?? month;
      continue;
    }
    const tm = lines[i].match(TIME);
    if (!tm || !month) continue;
    // A time row is followed by: name, price, then "N tickets available".
    const name = (lines[i + 1] ?? '').trim();
    const priceText = lines[i + 2]?.includes('€') ? lines[i + 2] : null;
    const spotsMatch = (lines[i + 3] ?? '').match(/(\d+)\s+tickets?\s+available/i);
    if (name && !/€/.test(name)) {
      out.push({ day, month, hh: Number(tm[1]), mm: Number(tm[2]), name, priceText, spotsLeft: spotsMatch ? Number(spotsMatch[1]) : null });
    }
  }
  return out;
}

/** "0,00 €" → 0, "10,00 €" → 10, null → null. */
export function parseParkagePrice(text: string | null): number | null {
  if (!text) return null;
  const m = text.match(/(\d+)[.,](\d{2})/);
  if (m) return Number(`${m[1]}.${m[2]}`);
  const whole = text.match(/(\d+)\s*€/);
  return whole ? Number(whole[1]) : null;
}
