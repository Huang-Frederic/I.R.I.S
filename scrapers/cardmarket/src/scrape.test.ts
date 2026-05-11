import { describe, it, expect } from 'vitest';
import { extractCardsFromHtml } from './scrape';

const BRILLIANT_STARS_FIXTURE = `
<div class="d-flex mb-4 col-12 col-sm-6 col-md-4 col-lg-3">
  <a href="/en/Pokemon/Products/Singles/Brilliant-Stars/Exeggcute-BRS001" class="card text-center w-100 galleryBox">
    <img src="https://product-images.s3.cardmarket.com/51/BRS/608425/608425.jpg" alt="Exeggcute " class="lazy card-img-top img-fluid">
    <div class="card-body d-flex flex-column">
      <h2 class="card-title h3"><span></span>&nbsp;Exeggcute  (BRS 001)</h2>
      <p class="card-text h5"></p>
      <p class="card-text text-muted">From <b>0,02 €</b></p>
    </div>
  </a>
</div>
<div class="d-flex mb-4 col-12 col-sm-6 col-md-4 col-lg-3">
  <a href="/en/Pokemon/Products/Singles/Brilliant-Stars/Shaymin-VSTAR-V3-BRS014" class="card text-center w-100 galleryBox">
    <img src="https://product-images.s3.cardmarket.com/51/BRS/675937/675937.jpg" alt="Shaymin VSTAR " class="lazy card-img-top img-fluid">
    <div class="card-body d-flex flex-column">
      <h2 class="card-title h3"><span></span>&nbsp;Shaymin VSTAR  (BRS 014)</h2>
      <p class="card-text h5"></p>
      <p class="card-text text-muted">From <b>0,25 €</b></p>
    </div>
  </a>
</div>
`;

describe('extractCardsFromHtml', () => {
  it('parses idProduct, setNumber, name from Brilliant Stars fixture', () => {
    const cards = extractCardsFromHtml(BRILLIANT_STARS_FIXTURE);

    expect(cards).toHaveLength(2);

    expect(cards[0]).toEqual({
      idProduct: 608425,
      setNumber: '1',
      urlVariant: null,
      urlPath: '/en/Pokemon/Products/Singles/Brilliant-Stars/Exeggcute-BRS001',
      name: 'Exeggcute (BRS 001)',
      setPrefix: 'BRS',
    });

    expect(cards[1]).toEqual({
      idProduct: 675937,
      setNumber: '14',
      urlVariant: 'V3',
      urlPath: '/en/Pokemon/Products/Singles/Brilliant-Stars/Shaymin-VSTAR-V3-BRS014',
      name: 'Shaymin VSTAR (BRS 014)',
      setPrefix: 'BRS',
    });
  });

  it('parses JP set codes with embedded digits (sv1a, sv2a, s12a) — regression for v1 regex bug', () => {
    // JP SV-era cards have alphanumeric set codes ending in a letter
    // ("sv1a074" = code "sv1a", number "074"). The old regex `[A-Z]+\d+$`
    // refused to match these because it required pure-letter codes, leaving
    // the entire SV JP catalogue with 0 scraped cards.
    const fixture = `
      <a href="/fr/Pokemon/Products/Singles/Triplet-Beat/Tropius-V2-sv1a074" class="card galleryBox">
        <img src="https://product-images.s3.cardmarket.com/51/sv1a/701530/701530.jpg" alt="Tropius">
        <h2>Tropius</h2>
      </a>
      <a href="/fr/Pokemon/Products/Singles/Pokemon-Card-151/Mew-sv2a169" class="card galleryBox">
        <img src="https://product-images.s3.cardmarket.com/51/sv2a/701700/701700.jpg" alt="Mew">
        <h2>Mew</h2>
      </a>
    `;
    const cards = extractCardsFromHtml(fixture);
    expect(cards).toHaveLength(2);
    expect(cards[0].setNumber).toBe('74');
    expect(cards[0].setPrefix).toBe('sv1a');
    expect(cards[0].idProduct).toBe(701530);
    expect(cards[1].setNumber).toBe('169');
    expect(cards[1].setPrefix).toBe('sv2a');
  });

  it('parses digit-ending prefixes (s9, sv6, BW2, CP1, sm12) — regression for "scraper eats prefix-trailing digit" bug', () => {
    // The old letter-anchored regex `-[A-Za-z][A-Za-z0-9]*?[A-Za-z]\d+$`
    // required the prefix to end in a letter — failed catastrophically on
    // sets whose Cardmarket prefix ends in a digit. Either the row was
    // skipped entirely (no setNumber, hence dropped), OR the regex grabbed
    // a prefix-suffix digit and prepended it to the number (s9 + 100 →
    // setNumber "9100" stored, and prefix derived as "s"). The S3 image URL
    // `/51/{prefix}/...` is the authoritative source — anchoring on it
    // resolves the ambiguity.
    const fixture = `
      <a href="/fr/Pokemon/Products/Singles/Star-Birth/Carapuce-s9100" class="galleryBox">
        <img src="https://product-images.s3.cardmarket.com/51/s9/700100/700100.jpg" alt="Carapuce">
        <h2>Carapuce</h2>
      </a>
      <a href="/fr/Pokemon/Products/Singles/Mask-of-Change/Pikachu-sv6059" class="galleryBox">
        <img src="https://product-images.s3.cardmarket.com/51/sv6/700200/700200.jpg" alt="Pikachu">
        <h2>Pikachu</h2>
      </a>
      <a href="/fr/Pokemon/Products/Singles/Red-Collection/Larvesta-BW2011" class="galleryBox">
        <img src="https://product-images.s3.cardmarket.com/51/BW2/600000/600000.jpg" alt="Larvesta">
        <h2>Larvesta</h2>
      </a>
      <a href="/fr/Pokemon/Products/Singles/Magma-Gang-VS-Aqua/Camerupt-CP1002" class="galleryBox">
        <img src="https://product-images.s3.cardmarket.com/51/CP1/500000/500000.jpg" alt="Camerupt">
        <h2>Camerupt</h2>
      </a>
      <a href="/fr/Pokemon/Products/Singles/Alter-Genesis/Cosmog-sm12070" class="galleryBox">
        <img src="https://product-images.s3.cardmarket.com/51/sm12/400000/400000.jpg" alt="Cosmog">
        <h2>Cosmog</h2>
      </a>
    `;
    const cards = extractCardsFromHtml(fixture);
    expect(cards).toHaveLength(5);

    expect(cards[0].setPrefix).toBe('s9');
    expect(cards[0].setNumber).toBe('100');
    expect(cards[1].setPrefix).toBe('sv6');
    expect(cards[1].setNumber).toBe('59');
    expect(cards[2].setPrefix).toBe('BW2');
    expect(cards[2].setNumber).toBe('11');
    expect(cards[3].setPrefix).toBe('CP1');
    expect(cards[3].setNumber).toBe('2');
    expect(cards[4].setPrefix).toBe('sm12');
    expect(cards[4].setNumber).toBe('70');
  });

  it('returns empty array when html has no galleryBox elements', () => {
    expect(extractCardsFromHtml('<div>nothing</div>')).toEqual([]);
  });

  it('skips entries missing idProduct or setNumber', () => {
    const malformed = `
      <a href="/en/Pokemon/Products/Singles/Foo/Bar-XYZ001" class="galleryBox">
        <img src="https://example.com/no-id-pattern.jpg" alt="Bar">
        <h2>Bar (XYZ 001)</h2>
      </a>
    `;
    expect(extractCardsFromHtml(malformed)).toEqual([]);
  });
});
