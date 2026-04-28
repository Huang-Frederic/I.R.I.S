-- I.R.I.S — TCG catalog table
-- Local cache of Pokémon TCG cards, populated from Cardmarket via
-- scripts/scrape-cardmarket.ts. Serves as the primary source for
-- post-OCR enrichment (lookup by set_code + set_number + language).
--
-- Reuses the card_language and card_rarity enums from initial_schema.

create table tcg_catalog (
  id              uuid          primary key default gen_random_uuid(),
  cardmarket_id   text          not null,
  set_code        text          not null,
  set_number      text          not null,
  set_total       integer,
  language        card_language not null,
  card_name       text          not null,
  pokemon_name    text,
  pokemon_number  integer,
  set_name        text          not null,
  rarity          card_rarity,
  image_url       text,
  scraped_at      timestamptz   not null default now(),

  constraint tcg_catalog_unique unique (set_code, set_number, language)
);

-- Primary lookup: enrich pipeline queries by (set_code, set_number, language).
create index tcg_catalog_lookup_idx
  on tcg_catalog (set_code, set_number, language);

-- Secondary lookup: Phase 3 cron will look up cardmarket_id to fetch prices.
create index tcg_catalog_cardmarket_idx
  on tcg_catalog (cardmarket_id);

-- Fallback lookup: when set_code OCR fails, narrow by printed set_total + localId.
create index tcg_catalog_total_idx
  on tcg_catalog (set_total, set_number, language);

-- RLS: authenticated user has read access (mono-user app).
-- Writes happen exclusively from the bootstrap script via service role.
alter table tcg_catalog enable row level security;

create policy "tcg_catalog_read_authenticated" on tcg_catalog
  for select to authenticated using (true);
