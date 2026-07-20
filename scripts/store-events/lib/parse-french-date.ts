/**
 * Parse a French event date out of free text — the shops embed the date in the
 * product/event title ("Jeudi 23 Juillet 2026", "02/07/2026 à 18h30",
 * "Dimanche 7 Juin à 10h", "(11/07 à 20h)").
 *
 * Pure + deterministic: pass `refNow` so tests don't rot and year inference is
 * reproducible. Returns an ISO UTC string (built via Date.UTC so the calendar
 * date never shifts across timezones), or null when nothing parses.
 */

const MONTHS: Record<string, number> = {
  janvier: 1, fevrier: 2, 'février': 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, 'août': 8, septembre: 9, octobre: 10, novembre: 11,
  decembre: 12, 'décembre': 12,
};

const MONTH_ALTERNATION = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length) // longest first so "février" wins over a prefix
  .join('|');

/** Extract an optional "à 18h30" / "18h" / "20 h 30" time. */
function parseTime(text: string): { h: number; m: number } | null {
  const m = text.match(/(\d{1,2})\s*h\s*(\d{2})?/i);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  return { h, m: min };
}

/** Pick the year for a dateless day/month: this year, or next if already well past. */
function inferYear(month: number, day: number, time: { h: number; m: number } | null, refNow: Date): number {
  const y = refNow.getUTCFullYear();
  const candidate = Date.UTC(y, month - 1, day, time?.h ?? 12, time?.m ?? 0);
  // Upcoming-events pages: if the this-year date is more than 60 days behind
  // now, it's really next year's occurrence.
  if (candidate < refNow.getTime() - 60 * 24 * 60 * 60 * 1000) return y + 1;
  return y;
}

function build(year: number, month: number, day: number, time: { h: number; m: number } | null): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = new Date(Date.UTC(year, month - 1, day, time?.h ?? 0, time?.m ?? 0)).toISOString();
  // Guard against overflow (e.g. 31 avril → 1 mai): reject if the month rolled.
  if (new Date(iso).getUTCMonth() !== month - 1) return null;
  return iso;
}

export function parseFrenchDate(text: string, refNow: Date = new Date()): string | null {
  if (!text) return null;
  const t = text.toLowerCase();
  const time = parseTime(t);

  // 1) DD/MM/YYYY  (most explicit — try first)
  let m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return build(Number(m[3]), Number(m[2]), Number(m[1]), time);

  // 2) D <mois> YYYY
  m = t.match(new RegExp(`(\\d{1,2})\\s+(${MONTH_ALTERNATION})\\s+(\\d{4})`, 'i'));
  if (m) return build(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]), time);

  // 3) DD/MM  (no year → infer)
  m = t.match(/(\d{1,2})\/(\d{1,2})(?!\/?\d)/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    return build(inferYear(month, day, time, refNow), month, day, time);
  }

  // 4) D <mois>  (no year → infer)
  m = t.match(new RegExp(`(\\d{1,2})\\s+(${MONTH_ALTERNATION})\\b(?!\\s+\\d{4})`, 'i'));
  if (m) {
    const day = Number(m[1]);
    const month = MONTHS[m[2].toLowerCase()];
    return build(inferYear(month, day, time, refNow), month, day, time);
  }

  return null;
}
