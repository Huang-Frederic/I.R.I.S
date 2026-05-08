-- Stores the canonical Cardmarket URL path per scraped product, plus the
-- resolved URL on each card so the UI can deep-link to the matched product
-- page (sanity check that the right CM card was picked for pricing).

alter table cardmarket_card_index
  add column url_path text;

alter table cards
  add column cardmarket_url text;
