/**
 * Parse Play-in's rendered events text into raw event records. Play-in is a
 * PandaCSS/RSC app (no stable selectors), but the visible text is a clean,
 * stable sequence:
 *
 *   Mercredi 22 Juillet          ← date header (weekday day month, no year)
 *   De 14:30 à 19:00             ← time range
 *   Pokémon Coloriage            ← name (one or more lines)
 *   Voir la description          ← boilerplate marker
 *   Gratuit                      ← price (or "5,00 €")
 *   S'inscrire / Voir la fiche…  ← boilerplate
 *
 * Pure + testable: takes the already-split lines, returns raw records. Turning
 * them into StoreEvent (date parsing, classify, url) is the extractor's job.
 */
const WEEKDAY = /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+\d{1,2}\s+\S/i;
const TIME = /^De\s+(\d{1,2}):(\d{2})\s+à/i;

export interface RawPlayinEvent {
  /** e.g. "Mercredi 22 Juillet" — no year (extractor infers it). */
  dateHeader: string;
  hh: number;
  mm: number;
  name: string;
  /** Raw price cell text ("Gratuit" / "5,00 €"), or null. */
  priceText: string | null;
}

export function parsePlayinEvents(lines: string[]): RawPlayinEvent[] {
  const out: RawPlayinEvent[] = [];
  let currentDate = '';
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (WEEKDAY.test(line)) {
      currentDate = line;
      continue;
    }
    const tm = line.match(TIME);
    if (!tm || !currentDate) continue;

    // Name = lines between the time row and "Voir la description".
    const nameParts: string[] = [];
    let j = i + 1;
    while (j < lines.length && !/^Voir la description/i.test(lines[j]) && !TIME.test(lines[j]) && !WEEKDAY.test(lines[j])) {
      nameParts.push(lines[j]);
      j += 1;
    }
    // Price is the line right after "Voir la description".
    const priceText = /^Voir la description/i.test(lines[j] ?? '') ? (lines[j + 1] ?? null) : null;

    if (nameParts.length > 0) {
      out.push({ dateHeader: currentDate, hh: Number(tm[1]), mm: Number(tm[2]), name: nameParts.join(' ').trim(), priceText });
    }
    i = j; // resume after the name block
  }
  return out;
}

/** "Gratuit" → 0, "5,00 €" → 5, unknown → null. */
export function parsePlayinPrice(text: string | null): number | null {
  if (!text) return null;
  if (/gratuit/i.test(text)) return 0;
  const m = text.match(/(\d+)[.,](\d{2})/);
  if (m) return Number(`${m[1]}.${m[2]}`);
  const whole = text.match(/(\d+)\s*€/);
  return whole ? Number(whole[1]) : null;
}
