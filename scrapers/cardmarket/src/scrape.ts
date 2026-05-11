import type { ScrapedCard } from './types.js';

/**
 * Pure DOM parser for one Cardmarket gallery page.
 * Takes raw HTML, returns the extracted cards.
 *
 * Used both:
 *  - At runtime inside Playwright via page.evaluate (we re-export the body
 *    as a string and inject it into the browser context).
 *  - In unit tests via happy-dom (this file).
 */
export function extractCardsFromHtml(html: string): ScrapedCard[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return extractCardsFromDocument(doc);
}

/**
 * The actual extraction logic, parameterized on Document so it works
 * both with happy-dom (test) and the live page DOM (Playwright runtime).
 */
export function extractCardsFromDocument(doc: Document): ScrapedCard[] {
  const cards: ScrapedCard[] = [];
  const links = doc.querySelectorAll<HTMLAnchorElement>(
    'a.galleryBox[href*="/Pokemon/Products/Singles/"]',
  );

  for (const a of Array.from(links)) {
    const href = a.getAttribute('href') ?? '';
    // href format: /{lang}/Pokemon/Products/Singles/{set-slug}/{Card-Name}-(V?N-)?{setcode}{number}
    const last = href.split('/').pop() ?? '';

    // url_variant: -V1- / -V2- / etc. between name and setcode
    const variantMatch = last.match(/-V(\d+)-/i);
    const urlVariant = variantMatch ? `V${variantMatch[1]}` : null;

    // idProduct + setPrefix from the S3 image URL — this is the canonical
    //   source of the prefix (it's literally how Cardmarket builds image
    //   paths). Extract this FIRST so we can use it to anchor the slug
    //   parse below.
    //   <img src="https://product-images.s3.cardmarket.com/51/{set_prefix}/{id_product}/{id_product}.jpg">
    const img = a.querySelector('img');
    const dataEcho =
      img?.getAttribute('data-echo') ?? img?.getAttribute('src') ?? '';
    const imgMatch = dataEcho.match(/\/51\/([^/]+)\/(\d+)\/\d+\.(jpg|webp|png)/i);
    const setPrefix = imgMatch ? imgMatch[1] : null;
    const idProduct = imgMatch ? Number(imgMatch[2]) : null;

    // Extract setNumber from the slug. We anchor on the S3 setPrefix when
    // we have it: the slug ends with `-{setPrefix}{number}` (case-insensitive).
    // This handles digit-ending prefixes (s9, sv6, BW2, CP1, sm12) that the
    // legacy letter-anchored regex either skipped entirely or split wrong —
    // it would eat the prefix's trailing digit and prepend it to the number
    // (s9 + 100 → s + 9100).
    let setNumber: string | null = null;
    if (setPrefix) {
      const escaped = setPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = last.match(new RegExp(`-${escaped}(\\d+)$`, 'i'));
      if (m) {
        setNumber = String(parseInt(m[1], 10));
      }
    }
    // Fallback for cards where the S3 prefix wasn't extractable (very old
    // promos without product images, or malformed gallery rows). Same
    // letter-anchored pattern as the original — works for Latin sets but
    // misses digit-ending JP/legacy sets.
    if (setNumber === null) {
      const setCodeMatch = last.match(/-([A-Za-z][A-Za-z0-9]*?[A-Za-z])(\d+)$/);
      if (setCodeMatch) {
        setNumber = String(parseInt(setCodeMatch[2], 10));
      }
    }

    // Display name from <h2> or img alt.
    const h2 = a.querySelector('h2');
    const titleText = h2?.textContent?.trim() ?? img?.getAttribute('alt') ?? '';
    const name = titleText.replace(/\s+/g, ' ').trim();

    if (idProduct && setNumber) {
      cards.push({
        idProduct,
        setNumber,
        urlVariant,
        urlPath: href,
        name,
        setPrefix,
      });
    }
  }

  return cards;
}
