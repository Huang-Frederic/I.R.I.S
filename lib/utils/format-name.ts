/**
 * Normalize a string for fuzzy equality: lowercase, strip combining marks
 * (NFD diacritics), collapse whitespace. Used to detect when an OCR-raw name
 * is "the same" as the canonical form, so we don't display "Dracaufeu (DRACAUFEU)".
 */
function normalize(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function displayPokemonName(card: {
  pokemon_name: string | null | undefined;
  pokemon_name_ocr?: string | null | undefined;
}): string {
  const canonical = card.pokemon_name ?? '';
  const ocr = card.pokemon_name_ocr ?? '';
  if (!ocr) return canonical;
  if (normalize(ocr) === normalize(canonical)) return canonical;
  return `${canonical} (${ocr})`;
}

export function displayCardName(card: {
  card_name: string | null | undefined;
  card_name_ocr?: string | null | undefined;
}): string {
  const canonical = card.card_name ?? '';
  const ocr = card.card_name_ocr ?? '';
  if (!ocr) return canonical;
  if (normalize(ocr) === normalize(canonical)) return canonical;
  return `${canonical} (${ocr})`;
}

export function displaySetName(card: {
  set_name: string | null | undefined;
}): string {
  return card.set_name ?? '';
}
