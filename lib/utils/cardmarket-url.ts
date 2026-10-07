// lib/utils/cardmarket-url.ts

/** Cardmarket's `language` filter ids for the languages a card can have
 *  here. Only French for now — Fred wanted the French offers straight away
 *  instead of picking the filter on every visit. */
const CARDMARKET_LANGUAGE_ID: Partial<Record<string, number>> = {
  FR: 2,
};

/** The card's Cardmarket link with its offers filtered to the card's own
 *  language (`?language=2` for a French card). Other languages, a missing
 *  link or one that isn't a URL come back unchanged. */
export function cardmarketUrlForLanguage(url: string | null, language: string | null | undefined): string | null {
  if (!url) return url;
  const languageId = language ? CARDMARKET_LANGUAGE_ID[language] : undefined;
  if (languageId === undefined) return url;
  if (!/^https?:\/\//.test(url)) return url;
  // Edited as text: re-serialising through URL would rewrite the rest of the
  // query (a search link's %20 spaces come back as +).
  const param = `language=${languageId}`;
  if (/[?&]language=[^&#]*/.test(url)) return url.replace(/([?&])language=[^&#]*/, `$1${param}`);
  const [base, hash] = url.split('#', 2);
  return `${base}${base.includes('?') ? '&' : '?'}${param}${hash !== undefined ? `#${hash}` : ''}`;
}
