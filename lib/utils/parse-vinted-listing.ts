import type { CardCondition, CardLanguage } from '@/lib/types';
import type { ParsedListing } from '@/lib/types/vinted-import';

const PATTERN_RE = /\((jpn|eng|fra|kor|chn)_([a-z0-9-]+)-(\d+)\)/i;

const LANG_MAP: Record<string, CardLanguage> = {
  jpn: 'JP',
  eng: 'EN',
  fra: 'FR',
  kor: 'KO',
  chn: 'CN',
};

/**
 * Detects the condition keyword in the description. First match wins.
 * Order matters: more specific patterns (e.g. "Lightly played") must come
 * before broader ones (e.g. "played").
 */
function detectCondition(text: string): CardCondition {
  if (/light(ly)?\s+played|\bLP\b/i.test(text)) return 'LP';
  if (/near\s+mint|\bNM\b/i.test(text)) return 'NM';
  if (/excellent|\bEX\b/i.test(text)) return 'EX';
  if (/\bgood\b|\bGD\b/i.test(text)) return 'GD';
  if (/played|\bPL\b|\bPO\b|poor/i.test(text)) return 'PL';
  return 'NM';
}

export function parseVintedListing(input: {
  title: string;
  description: string;
}): ParsedListing | null {
  const haystack = `${input.title}\n${input.description}`;
  const match = haystack.match(PATTERN_RE);
  if (!match) return null;
  const [, langCode, setCode, setNumber] = match;
  const language = LANG_MAP[langCode.toLowerCase()];
  if (!language) return null;
  return {
    language,
    setCode: setCode.toLowerCase(),
    setNumber,
    condition: detectCondition(input.description),
  };
}
