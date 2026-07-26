/**
 * Conversion between a `datetime-local` input and an instant.
 *
 * The trap is one function call wide: `toISOString()` renders UTC, while a
 * `datetime-local` input reads and writes local wall time. Filling the input
 * from `toISOString().slice(0, 16)` silently shifts every game by the local
 * offset — an hour or two in Paris, and the wrong day either side of midnight.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DDTHH:mm` in local time, the format the input expects. */
export function toLocalInputValue(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/**
 * Whether a stored instant carries a real time of day, or only a placeholder.
 *
 * Games recorded before the import form captured a time sit at exactly
 * midnight or midday UTC — the two defaults the pipeline ever produced. Shown
 * in local time those read as "02:00" or "14:00", which looks like a result
 * rather than a missing value.
 *
 * The test is on whole UTC hours, and it is deliberately blunt: a game really
 * imported on the hour has its time hidden. Omitting a correct time is a
 * smaller wrong than displaying an invented one, and it costs a legacy row
 * nothing since it never had a time to begin with.
 */
export function hasRealTime(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getUTCMinutes() !== 0 || d.getUTCSeconds() !== 0;
}

/**
 * The instant a local wall-clock string denotes, as an ISO timestamp.
 *
 * Returns null on anything unparseable rather than an Invalid Date, so a
 * cleared input cannot travel as `"Invalid Date"` and land in the database.
 */
export function fromLocalInputValue(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
