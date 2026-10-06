// lib/utils/vinted-title.ts
// TS mirror of vinted-agent/titles.py vinted_title(): the bot runs every
// title through it before posting, so the fiche previews must too. Vinted
// rejects a title with "Le titre contient trop de lettres majuscules" — an
// all-caps word like VMAX or SOLDIER is enough — and names pasted from a
// spreadsheet carry tabs.

const WORD = /[\p{L}\p{N}]+/gu;

/** Whitespace collapsed to single spaces, and all-caps words of 4+ letters
 *  given a single capital (VMAX → Vmax, SOLDIER → Soldier). Short codes (EX,
 *  GX, V, SE), set codes with digits and the [FR] language tag are kept.
 *  Idempotent. */
export function vintedTitle(title: string): string {
  const collapsed = title.split(/\s+/).filter(Boolean).join(' ');
  return collapsed.replace(WORD, (word, offset: number) => {
    if (/\p{N}/u.test(word) || word.length < 4) return word;
    const allCaps = word === word.toUpperCase() && word !== word.toLowerCase();
    if (!allCaps) return word;
    if (collapsed[offset - 1] === '[' && collapsed[offset + word.length] === ']') return word;
    return word[0] + word.slice(1).toLowerCase();
  });
}
