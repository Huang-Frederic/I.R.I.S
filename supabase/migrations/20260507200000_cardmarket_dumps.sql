-- Cardmarket data dumps — local pricing source replacing TCGdex live calls.
-- Sourced from Cardmarket's official JSON dumps (catalog + pricing) plus the
-- HTML expansion-filter dropdown (idExpansion → set name in FR locale).
--
-- Pipeline: card.set_name + card.pokemon_name → idExpansion → idProduct →
-- pricing. See lib/api/cardmarket-pricing.ts.
--
-- Refresh: re-run scripts/upload-cardmarket-dumps.ts whenever you re-download
-- the dumps (manual, ~weekly).

-- 1. Expansion ID → set name (parsed from Cardmarket FR locale dropdown).
--    name_normalized = lowercased + accents stripped (NFD), for fuzzy lookup.
create table cardmarket_expansions (
  id_expansion int primary key,
  name text not null,
  name_normalized text not null
);

create index cardmarket_expansions_name_normalized_idx
  on cardmarket_expansions (name_normalized);

-- 2. Singles catalog (~67k rows). The `name` column embeds attack disambig
--    in brackets ("Poltchageist [Storehouse Hideaway | Hook]"); we store the
--    extracted Pokémon-name prefix in `card_prefix` for fast lookup.
create table cardmarket_products (
  id_product int primary key,
  name text not null,
  card_prefix text not null,
  card_prefix_normalized text not null,
  id_expansion int not null references cardmarket_expansions (id_expansion),
  id_metacard int
);

-- Primary lookup path: (id_expansion, card_prefix_normalized).
create index cardmarket_products_lookup_idx
  on cardmarket_products (id_expansion, card_prefix_normalized);

-- Secondary: cross-expansion search by metacard (same card across reprints).
create index cardmarket_products_metacard_idx
  on cardmarket_products (id_metacard);

-- 3. Pricing per product. Holo fields cover the case where a single
--    idProduct merges regular + foil (older sets); modern sets use
--    separate idProducts for regular vs reverse-holo prints.
create table cardmarket_pricing (
  id_product int primary key references cardmarket_products (id_product) on delete cascade,
  low numeric(10, 2),
  trend numeric(10, 2),
  avg numeric(10, 2),
  avg1 numeric(10, 2),
  avg7 numeric(10, 2),
  avg30 numeric(10, 2),
  low_holo numeric(10, 2),
  trend_holo numeric(10, 2),
  avg_holo numeric(10, 2),
  updated_at timestamptz not null default now()
);

-- 4. RLS — read by any authed user, writes via service-role only.
alter table cardmarket_expansions enable row level security;
alter table cardmarket_products enable row level security;
alter table cardmarket_pricing enable row level security;

create policy cardmarket_expansions_read on cardmarket_expansions
  for select using (auth.uid() is not null);

create policy cardmarket_products_read on cardmarket_products
  for select using (auth.uid() is not null);

create policy cardmarket_pricing_read on cardmarket_pricing
  for select using (auth.uid() is not null);
