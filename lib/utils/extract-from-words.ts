import type { WordAnnotation } from '@/lib/types';

/**
 * Match "<card>/<total>" — exact-token form. Also matched as a substring later
 * to handle Vision merging the rarity glyph onto the number ("098/150RR").
 */
const SET_NUMBER_RE = /^(\d{1,3})\s*\/\s*(\d{1,3})$/;
const SET_NUMBER_SUBSTRING_RE = /(\d{1,3})\s*\/\s*(\d{1,3})/;

/**
 * Set codes look like "sv1a", "SV11W", "swsh4", "sm12a" — short alphanumerics
 * that ALWAYS mix letters and digits in modern Pokémon TCG. Requiring both
 * shapes filters out illustrator names ("Miyanose" — 8 letters), pure damage
 * numbers, and other footer noise that earlier passed a looser regex.
 *
 * Length 3–8: shorter than 3 catches the "x2" weakness multiplier and
 * single-energy-cost glyphs. No real Pokémon set code is 2 chars.
 *
 * Trade-off: drops the rare all-letter promo codes (PAL, SVE) — acceptable
 * because those are uncommon and the user can type them manually.
 */
function looksLikeSetCode(text: string): boolean {
  if (!/^[A-Za-z0-9]{3,8}$/.test(text)) return false;
  if (!/[A-Za-z]/.test(text) || !/\d/.test(text)) return false;
  // Real Pokémon set codes start with letters (SV11W, sm8b, bw5...). Tokens
  // starting with digits are usually heights ("10m" from "1.0m"), weights,
  // or attack damage glued to a glyph ("620W").
  if (!/^[A-Za-z]/.test(text)) return false;
  return !isCommonFalsePositive(text);
}

/**
 * Real-world OCR junk that passes the letters+digits shape but never
 * corresponds to a real set code:
 *   - "NO0499", "NO382"     → printed Pokédex number ("全国図鑑NO.0499")
 *   - "x2", "x4", "Wx2"     → weakness/resistance multipliers (Wx2 = "弱点 ×2")
 *   - "C2021", "P2018"      → © year prefixes Vision sometimes glues together
 *   - "5ban"                → 5ban Graphics watermark in card art
 *   - "HP160"                → HP indicator, not a set
 *   - 4-digit pure-numeric  → years
 */
function isCommonFalsePositive(text: string): boolean {
  const t = text.toUpperCase();
  if (/^NO\d+$/.test(t)) return true;
  if (/^W?X\d+$/.test(t)) return true;
  if (/^[A-Z]\d{4}$/.test(t)) return true;
  if (/^HP\d+$/.test(t)) return true;
  if (t === '5BAN') return true;
  return false;
}

/**
 * Punctuation Vision sometimes glues to alphanumeric tokens (brackets from a
 * stylized set-code box, dots from copyright lines, etc.). We strip these
 * before testing against SET_CODE_RE.
 */
const STRIP_PUNCT_RE = /[\s.,;:!?\[\](){}<>«»"'`*\\\/_-]/g;

export interface ExtractOptions {
  /** Drop words below this Vision confidence. Defaults to 0 (keep everything). */
  minConfidence?: number;
}

/**
 * Score how "footer-like" a word is. Higher = better fit for a Pokémon card
 * footer item (set code, set number). Used as a tie-breaker, NOT as a hard
 * filter — that earlier design broke when the user uploaded a pre-cropped
 * footer (the whole image is the footer, so y wasn't ≥ 0.8).
 *
 * Rewards bottom (high y) and left (low x); a footer-bottom-left word like
 * "111/086" at (.05, .92) scores ~0.91, while attack damage "30/30" at
 * (.5, .4) scores ~0.30.
 */
function footerScore(word: WordAnnotation): number {
  const cx = word.x + word.width / 2;
  const cy = word.y + word.height / 2;
  return cy - cx * 0.2;
}

/**
 * Find the "<card>/<total>" set number printed near the bottom-left of the card.
 *
 * Strategy (no hard region filter — works on full cards AND on user-supplied
 * footer crops):
 *   1. Collect every word that matches SET_NUMBER_RE on its own.
 *   2. Also scan adjacent triples ("136", "/", "174") which Vision sometimes
 *      tokenizes when the slash is wide / on its own.
 *   3. Sort all candidates by footerScore and return the best one.
 *
 * Trade-off: a card with two slash-numbers (set number + something like
 * "30/30" attack damage) will pick the one closest to bottom-left, which is
 * the desired behavior on real Pokémon cards.
 */
export function findSetNumberCandidate(
  words: WordAnnotation[],
  options: ExtractOptions = {},
): { card: string; total: string; raw: string } | null {
  const minConfidence = options.minConfidence ?? 0;
  const filtered = words.filter((w) => w.confidence >= minConfidence);

  type Match = { word: WordAnnotation; card: string; total: string };
  const matches: Match[] = [];

  for (const word of filtered) {
    const m = word.text.match(SET_NUMBER_RE);
    if (m) matches.push({ word, card: m[1], total: m[2] });
  }

  if (matches.length === 0) {
    // Substring scan — Vision often glues the rarity glyph onto the number
    // ("098/150RR", "034/054RR XYm"). Same regex but as a substring.
    for (const word of filtered) {
      const m = word.text.match(SET_NUMBER_SUBSTRING_RE);
      if (m) matches.push({ word, card: m[1], total: m[2] });
    }
  }

  if (matches.length === 0) {
    // Triplet scan as last resort for Vision's aggressive tokenization.
    const ordered = [...filtered].sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
    for (let i = 0; i < ordered.length - 2; i++) {
      const left = ordered[i];
      const mid = ordered[i + 1];
      const right = ordered[i + 2];
      const ld = left.text.match(/^(\d{1,3})$/)?.[1];
      const rd = right.text.match(/^(\d{1,3})$/)?.[1];
      if (ld && rd && /^\/$/.test(mid.text)) {
        matches.push({ word: left, card: ld, total: rd });
      }
    }
  }

  if (matches.length === 0) return null;

  matches.sort((a, b) => footerScore(b.word) - footerScore(a.word));
  const best = matches[0];
  return { card: best.card, total: best.total, raw: `${best.card}/${best.total}` };
}

/**
 * Find the set code (e.g. "SV11W") near the set number.
 *
 * Same loose-everywhere approach as findSetNumberCandidate: search the whole
 * image, then prefer footer-y tokens, with a strong nudge toward whichever is
 * closest to the previously-found set number.
 */
export function findSetCodeCandidate(
  words: WordAnnotation[],
  setNumberRaw: string | null,
  options: ExtractOptions = {},
): string | null {
  const minConfidence = options.minConfidence ?? 0;

  // Strip surrounding punctuation, then test against the code shape. Words
  // that are pure digits, illustrator names, or the set number itself fail.
  const candidates = words
    .filter((w) => w.confidence >= minConfidence)
    .map((w) => ({ word: w, cleaned: w.text.replace(STRIP_PUNCT_RE, '') }))
    .filter((c) => looksLikeSetCode(c.cleaned))
    .filter((c) => c.cleaned !== setNumberRaw);

  if (candidates.length === 0) return null;

  const numberWord = setNumberRaw
    ? words.find((w) => w.text.replace(STRIP_PUNCT_RE, '') === setNumberRaw.replace(STRIP_PUNCT_RE, ''))
    : null;

  if (numberWord) {
    // Prefer the closest neighbor of the set number — this picks "sv1W" over
    // some random alphanumeric in the artwork.
    const cx = numberWord.x + numberWord.width / 2;
    const cy = numberWord.y + numberWord.height / 2;
    candidates.sort((a, b) => {
      const da = Math.hypot(a.word.x + a.word.width / 2 - cx, a.word.y + a.word.height / 2 - cy);
      const db = Math.hypot(b.word.x + b.word.width / 2 - cx, b.word.y + b.word.height / 2 - cy);
      return da - db;
    });
  } else {
    // No set number to anchor against — fall back to footer-iest.
    candidates.sort((a, b) => footerScore(b.word) - footerScore(a.word));
  }

  return candidates[0].cleaned;
}

/**
 * Match an OCR token against a list of known set IDs, tolerating common
 * Vision misreads (l↔1, S↔5, o↔0, B↔8). The OCR text often contains the
 * actual set code as a separate word — e.g. "BWS" (= "BW5"), "SvllW" (= "SV11W"),
 * "XYm" (= "xym"). When we have the cached TCGdex set list available we can
 * just look the token up against it instead of relying on shape heuristics.
 *
 * Returns the canonical set ID (lowercased), or null if no token in `text`
 * fuzzy-matches any known ID.
 */
export function findKnownSetCodeInText(text: string, knownIds: string[]): string | null {
  if (!text) return null;
  const tokens = new Set<string>();
  for (const raw of text.split(/[\s\n]+/)) {
    const cleaned = raw.replace(STRIP_PUNCT_RE, '');
    if (cleaned.length >= 2 && cleaned.length <= 8) tokens.add(cleaned);
  }
  if (tokens.size === 0) return null;

  const normIds = new Map<string, string>();
  for (const id of knownIds) normIds.set(ocrNormalize(id), id);

  let bestId: string | null = null;
  let bestScore = -1;

  for (const token of tokens) {
    const nt = ocrNormalize(token);

    // Exact-after-normalization match wins outright.
    const exact = normIds.get(nt);
    if (exact) {
      const score = 100 + exact.length;
      if (score > bestScore) { bestScore = score; bestId = exact; }
      continue;
    }

    // Levenshtein 1 on normalized form, length ≥ 4 (avoids spurious 3-char matches).
    if (nt.length < 4) continue;
    for (const [normId, canonical] of normIds) {
      if (Math.abs(normId.length - nt.length) > 1) continue;
      if (levenshtein(nt, normId) <= 1) {
        const score = 50 + canonical.length;
        if (score > bestScore) { bestScore = score; bestId = canonical; }
      }
    }
  }
  return bestId;
}

/**
 * Normalize a string for OCR comparison by collapsing the most common Vision
 * misreads to a canonical form. Lowercase + l→1 + s→5 + o→0 + b→8 reverses
 * the typography errors we see in the field on Pokémon set codes.
 */
function ocrNormalize(s: string): string {
  return s.toLowerCase().replace(/l/g, '1').replace(/s/g, '5').replace(/o/g, '0').replace(/b/g, '8');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}
