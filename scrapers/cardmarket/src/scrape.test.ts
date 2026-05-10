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
    });

    expect(cards[1]).toEqual({
      idProduct: 675937,
      setNumber: '14',
      urlVariant: 'V3',
      urlPath: '/en/Pokemon/Products/Singles/Brilliant-Stars/Shaymin-VSTAR-V3-BRS014',
      name: 'Shaymin VSTAR (BRS 014)',
    });
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
