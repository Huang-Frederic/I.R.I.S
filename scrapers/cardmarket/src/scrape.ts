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

    // Extract trailing setcode+number (lowercase letters + digits at the end of slug).
    // Pattern: -{SETCODE}{NUMBER} where SETCODE is letters+optional digits, NUMBER is pure digits
    // Example: -BRS001, -BRS014, etc.
    const setCodeMatch = last.match(/-([A-Z]+)(\d+)$/i);
    let setNumber: string | null = null;
    if (setCodeMatch) {
      const numRaw = setCodeMatch[2];
      setNumber = String(parseInt(numRaw, 10));
    }

    // idProduct from <img src="https://product-images.s3.cardmarket.com/51/{set}/{idProduct}/{idProduct}.jpg">
    const img = a.querySelector('img');
    const dataEcho =
      img?.getAttribute('data-echo') ?? img?.getAttribute('src') ?? '';
    const idMatch = dataEcho.match(/\/(\d+)\/\d+\.(jpg|webp|png)/i);
    const idProduct = idMatch ? Number(idMatch[1]) : null;

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
      });
    }
  }

  return cards;
}
