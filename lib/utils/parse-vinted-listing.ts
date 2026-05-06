import type { CardCondition, CardLanguage } from '@/lib/types';
import type { ParsedListing } from '@/lib/types/vinted-import';

/** Primary pattern (lives in the description templates we generate via lot-template/vinted-template):
 *  e.g. `(jpn_sv11b-148)`. Captures language code (3 letters) + set code + set number. */
const PATTERN_DESC_RE = /\((jpn|eng|fra|kor|chn)_([a-z0-9-]+)-(\d+)\)/i;

/** Fallback pattern (lives in the TITLE that Vinted's wardrobe endpoint returns
 *  even when description is truncated): `(SET_CODE NUMBER) [LANG]`
 *  e.g. `(SV11B 148) [JP]` or `(swsh9 31) [EN]`. Set + number can be in either case;
 *  language is the 2-letter ISO-ish suffix in brackets. */
const PATTERN_TITLE_RE = /\(([A-Za-z0-9]+)\s+(\d+)\)\s*\[([A-Za-z]{2})\]/;

const LANG_MAP_3: Record<string, CardLanguage> = {
  jpn: 'JP',
  eng: 'EN',
  fra: 'FR',
  kor: 'KO',
  chn: 'CN',
};

const LANG_MAP_2: Record<string, CardLanguage> = {
  jp: 'JP',
  en: 'EN',
  fr: 'FR',
  ko: 'KO',
  kr: 'KO',
  cn: 'CN',
};

/**
 * Detects the condition keyword in the description. First match wins.
 * Order matters: more specific patterns must come before broader ones.
 * Note: 'LP' (Lightly Played) is collapsed into 'PL' since CardCondition
 * type does not include LP.
 */
function detectCondition(text: string): CardCondition {
  if (/near\s+mint|\bNM\b/i.test(text)) return 'NM';
  if (/excellent|\bEX\b/i.test(text)) return 'EX';
  if (/\bgood\b|\bGD\b/i.test(text)) return 'GD';
  if (/light(ly)?\s+played|\bLP\b|played|\bPL\b/i.test(text)) return 'PL';
  if (/\bPO\b|poor/i.test(text)) return 'PO';
  return 'NM';
}

export function parseVintedListing(input: {
  title: string;
  description: string;
}): ParsedListing | null {
  const haystack = `${input.title}\n${input.description}`;

  // Strategy 1: description-style `(jpn_sv11b-148)` pattern.
  const descMatch = haystack.match(PATTERN_DESC_RE);
  if (descMatch) {
    const [, langCode, setCode, setNumber] = descMatch;
    const language = LANG_MAP_3[langCode.toLowerCase()];
    if (language) {
      return {
        language,
        setCode: setCode.toLowerCase(),
        setNumber,
        condition: detectCondition(input.description),
      };
    }
  }

  // Strategy 2: title-style `(SV11B 148) [JP]` pattern. Used when wardrobe
  // endpoint returns a summary view without the full description.
  const titleMatch = input.title.match(PATTERN_TITLE_RE);
  if (titleMatch) {
    const [, setCode, setNumber, langCode] = titleMatch;
    const language = LANG_MAP_2[langCode.toLowerCase()];
    if (language) {
      return {
        language,
        setCode: setCode.toLowerCase(),
        setNumber,
        condition: detectCondition(input.description),
      };
    }
  }

  return null;
}
