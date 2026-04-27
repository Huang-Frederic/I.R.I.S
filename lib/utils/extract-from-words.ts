import type { WordAnnotation } from '@/lib/types';

/**
 * Where on the card we expect the bottom-left "footer" — set code, set number,
 * regulation mark, copyright. Coordinates are normalized to the photo, not the
 * card itself, so they're tolerant of the card not filling the whole frame.
 *
 * Tightened y/x ranges than gut feeling because:
 *   - x: footer is left half of the card; allow up to .55 to cover wider crops.
 *   - y: footer is bottom ~20% of the card; .80–1.0 captures it even if there's
 *     a stand or some background visible above the card edge.
 */
const FOOTER_REGION = { xMin: 0, xMax: 0.55, yMin: 0.8, yMax: 1 };

/**
 * Match "<card>/<total>" — same regex as parse-set-number but applied per-word
 * + as concatenations of adjacent words (Vision sometimes splits "136/174" into
 * three tokens "136", "/", "174").
 */
const SET_NUMBER_RE = /^(\d{1,3})\s*\/\s*(\d{1,3})$/;

/**
 * Set codes are short alphanumerics: "sv1a", "SV11W", "swsh4", "PAL".
 * 2–8 chars, must contain at least one letter (excludes pure numbers).
 */
const SET_CODE_RE = /^[A-Za-z0-9]{2,8}$/;

export interface ExtractOptions {
  /** Override the default footer region (mostly for tests). */
  region?: { xMin: number; xMax: number; yMin: number; yMax: number };
  /** Drop words below this Vision confidence. Defaults to 0 (keep everything). */
  minConfidence?: number;
}

function inRegion(
  word: WordAnnotation,
  region: { xMin: number; xMax: number; yMin: number; yMax: number },
): boolean {
  // Use the word's centroid so a word straddling the region boundary still counts
  // when the bulk of it is inside.
  const cx = word.x + word.width / 2;
  const cy = word.y + word.height / 2;
  return cx >= region.xMin && cx <= region.xMax && cy >= region.yMin && cy <= region.yMax;
}

/**
 * Find the "<card>/<total>" set number printed in the bottom-left of the card.
 *
 * Strategy:
 *   1. Filter words to the footer region.
 *   2. First pass: any single word matching the regex outright (most common
 *      when Vision keeps "136/174" as one token).
 *   3. Second pass: scan triples of adjacent words for the split form
 *      ("136", "/", "174") to handle the cases where Vision tokenized aggressively.
 */
export function findSetNumberCandidate(
  words: WordAnnotation[],
  options: ExtractOptions = {},
): { card: string; total: string; raw: string } | null {
  const region = options.region ?? FOOTER_REGION;
  const minConfidence = options.minConfidence ?? 0;
  const footer = words.filter(
    (w) => w.confidence >= minConfidence && inRegion(w, region),
  );

  for (const word of footer) {
    const m = word.text.match(SET_NUMBER_RE);
    if (m) {
      return { card: m[1], total: m[2], raw: `${m[1]}/${m[2]}` };
    }
  }

  // Sort by reading order (top-to-bottom, then left-to-right) so adjacency is
  // meaningful. Footer is mostly one or two lines so a simple sort is enough.
  const ordered = [...footer].sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
  for (let i = 0; i < ordered.length - 2; i++) {
    const left = ordered[i];
    const mid = ordered[i + 1];
    const right = ordered[i + 2];
    const leftDigits = left.text.match(/^(\d{1,3})$/)?.[1];
    const rightDigits = right.text.match(/^(\d{1,3})$/)?.[1];
    if (leftDigits && rightDigits && (mid.text === '/' || /^\/$/.test(mid.text))) {
      return { card: leftDigits, total: rightDigits, raw: `${leftDigits}/${rightDigits}` };
    }
  }

  return null;
}

/**
 * Find the set code (e.g. "SV11W") next to the set number. We look in the same
 * footer region for a short alphanumeric token that:
 *   - matches SET_CODE_RE (mixed letters/digits, no slash)
 *   - isn't itself the set number we already found
 *   - prefers tokens to the LEFT of the set number (typical layout: "<code> <number>")
 *
 * Returns null if nothing convincing is in the region.
 */
export function findSetCodeCandidate(
  words: WordAnnotation[],
  setNumberRaw: string | null,
  options: ExtractOptions = {},
): string | null {
  const region = options.region ?? FOOTER_REGION;
  const minConfidence = options.minConfidence ?? 0;
  const footer = words.filter(
    (w) => w.confidence >= minConfidence && inRegion(w, region),
  );

  // Only words that have at least one letter, the right shape, and aren't the
  // set number itself. Strip simple punctuation Vision might attach.
  const candidates = footer
    .map((w) => ({ ...w, cleaned: w.text.replace(/[.,;:]/g, '') }))
    .filter((w) => SET_CODE_RE.test(w.cleaned))
    .filter((w) => /[A-Za-z]/.test(w.cleaned))
    .filter((w) => w.cleaned !== setNumberRaw);

  if (candidates.length === 0) return null;

  // Find the set-number word's center (if we have one) so we can prefer the
  // closest code-shaped neighbor. Without a number, return the first hit.
  const numberWord = setNumberRaw
    ? footer.find((w) => w.text.replace(/\s/g, '') === setNumberRaw)
    : null;

  if (!numberWord) {
    return candidates[0].cleaned;
  }

  const numberCx = numberWord.x + numberWord.width / 2;
  const numberCy = numberWord.y + numberWord.height / 2;
  candidates.sort((a, b) => {
    const da = Math.hypot(a.x + a.width / 2 - numberCx, a.y + a.height / 2 - numberCy);
    const db = Math.hypot(b.x + b.width / 2 - numberCx, b.y + b.height / 2 - numberCy);
    return da - db;
  });

  return candidates[0].cleaned;
}
