/**
 * Pokémon TCG set numbers are printed as "<card>/<setSize>" — e.g. "200/165".
 * This util pulls the first occurrence out of OCR'd text. We accept 1–3 digits
 * on each side and ignore whitespace around the slash so OCR noise doesn't
 * break the match.
 */

const SET_NUMBER_RE = /(\d{1,3})\s*\/\s*(\d{1,3})/;

export interface ParsedSetNumber {
  card: string;
  total: string;
  raw: string;
}

export function parseSetNumber(text: string): ParsedSetNumber | null {
  const match = text.match(SET_NUMBER_RE);
  if (!match) return null;
  return { card: match[1], total: match[2], raw: `${match[1]}/${match[2]}` };
}
