/**
 * Parse Play-in's rendered events text into raw event records. Play-in is a
 * PandaCSS/RSC app (no stable selectors), but the visible text is a clean,
 * stable sequence:
 *
 *   Mercredi 22 Juillet          ← date header (weekday day month, no year)
 *   De 14:30 à 19:00             ← time range
 *   Pokémon Coloriage            ← name (one or more lines)
 *   Gratuit                      ← price ("Gratuit" or "5,00 €")
 *   8 places restantes           ← remaining spots (optional — "Complet" has none)
 *   S'inscrire / Voir la fiche…  ← boilerplate call-to-action
 *
 * Pure + testable: takes the already-split lines, returns raw records. Turning
 * them into StoreEvent (date parsing, classify, url) is the extractor's job.
 */
const WEEKDAY = /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+\d{1,2}\s+\S/i;
// "De 14:30 à 19:00" — capture both start and (optional) end time.
const TIME = /^De\s+(\d{1,2}):(\d{2})(?:\s+à\s+(\d{1,2}):(\d{2}))?/i;
const PRICE_LINE = /^(gratuit|\d+[.,]\d{2}\s*€|\d+\s*€)$/i;
// Everything the theme prints after the price that isn't part of the name —
// stopping the name-collection loop here (not just at the next TIME/WEEKDAY)
// is what keeps a swallowed date header from silently carrying its date onto
// every event that follows it.
const NON_NAME_LINE = /^(complet|s'inscrire|voir la (description|fiche de l'événement)|\d+\s+places?\s+restantes?)$/i;

export interface RawPlayinEvent {
  /** e.g. "Mercredi 22 Juillet" — no year (extractor infers it). */
  dateHeader: string;
  hh: number;
  mm: number;
  /** End time on the same day, when the "à HH:MM" part is present. */
  endHh: number | null;
  endMm: number | null;
  name: string;
  /** Raw price cell text ("Gratuit" / "5,00 €"), or null. */
  priceText: string | null;
  /** Remaining spots ("8 places restantes" → 8), or null when not shown. */
  spotsLeft: number | null;
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

    // Name = lines between the time row and the first price/status/CTA line.
    const nameParts: string[] = [];
    let j = i + 1;
    while (
      j < lines.length &&
      !TIME.test(lines[j]) &&
      !WEEKDAY.test(lines[j]) &&
      !PRICE_LINE.test(lines[j]) &&
      !NON_NAME_LINE.test(lines[j])
    ) {
      nameParts.push(lines[j]);
      j += 1;
    }
    const priceText = PRICE_LINE.test(lines[j] ?? '') ? lines[j] : null;

    // Spots (when shown) follow the price line, before the "S'inscrire" CTA —
    // scanned rather than a fixed offset since "Complet" events have no
    // spots line at all. Bounded by the next event/day so it can't run away.
    let spotsLeft: number | null = null;
    for (let k = j + 1; k < lines.length && !TIME.test(lines[k]) && !WEEKDAY.test(lines[k]); k += 1) {
      const spotsMatch = lines[k].match(/(\d+)\s+places?\s+restantes?/i);
      if (spotsMatch) {
        spotsLeft = Number(spotsMatch[1]);
        break;
      }
      if (/^s'inscrire/i.test(lines[k])) break;
    }

    if (nameParts.length > 0) {
      out.push({
        dateHeader: currentDate,
        hh: Number(tm[1]),
        mm: Number(tm[2]),
        endHh: tm[3] != null ? Number(tm[3]) : null,
        endMm: tm[4] != null ? Number(tm[4]) : null,
        name: nameParts.join(' ').trim(),
        priceText,
        spotsLeft,
      });
    }
    i = j; // resume right after the price line
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
