-- Card-level index built from per-expansion HTML scrape (Cardmarket listing
-- pages). Each row maps one Cardmarket idProduct to its (expansion, set_number,
-- url_variant) identity.
--
-- The lookup helper goes:
--   card.set_code → cardmarket_expansions → idExpansion
--   (idExpansion, set_number) → cardmarket_card_index → 1-3 candidate idProducts
--   (rarity / variant heuristic if multiple) → final idProduct
--   idProduct → cardmarket_pricing → low/trend/avg
--
-- Populated by scripts/scrape-cardmarket-cards.ts (Playwright, run once per
-- expansion + when a new set drops, ~6×/year).

create table cardmarket_card_index (
  id_product int primary key references cardmarket_products (id_product) on delete cascade,
  id_expansion int not null references cardmarket_expansions (id_expansion),
  -- Stored normalized: lowercase, no leading zeros, slash-stripped.
  --   "031/237" → "31",  "001" → "1"
  set_number text not null,
  -- Cardmarket's URL slug discriminator: 'V1', 'V2', etc. — distinguishes
  -- multiple prints sharing the same set_number (Common vs Reverse Holo vs
  -- AR/SAR). Null when only one product exists for that number.
  url_variant text,
  -- Locale the scrape ran under (the cardmarket idProduct itself is locale-
  -- agnostic; this field is informational for diagnostics).
  language text not null,
  scraped_at timestamptz not null default now()
);

-- Primary lookup path.
create index cardmarket_card_index_lookup_idx
  on cardmarket_card_index (id_expansion, set_number);

alter table cardmarket_card_index enable row level security;

create policy cardmarket_card_index_read on cardmarket_card_index
  for select using (auth.uid() is not null);
