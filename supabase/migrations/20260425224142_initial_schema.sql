-- I.R.I.S — Initial schema
-- Spec source : context.md section 4
--
-- Tables : rarity_ranks (lookup), lots, cards, config
-- Storage buckets : card-photos, lot-photos
-- RPC : replace_pokedex_card (atomic Pokédex swap)
-- RLS : authenticated user has full access (mono-user app)

-- =============================================================================
-- Enums
-- =============================================================================

create type card_language as enum ('JP', 'EN', 'FR', 'DE', 'IT', 'ES', 'KO', 'PT', 'ZH');
create type card_condition as enum ('NM', 'EX', 'GD', 'PL', 'PO');
create type card_status as enum ('pokedex', 'for_sale', 'collection', 'sold');
create type card_rarity as enum ('SAR', 'AR', 'SR', 'CHR', 'RR', 'R_HOLO', 'R', 'UC', 'C', 'OTHER');

-- =============================================================================
-- rarity_ranks (lookup table — lets us order by rarity reliably)
-- =============================================================================

create table rarity_ranks (
  rarity card_rarity primary key,
  rank   integer not null,
  label  text not null
);

insert into rarity_ranks (rarity, rank, label) values
  ('SAR',    9, 'Special Art Rare'),
  ('AR',     8, 'Art Rare'),
  ('SR',     7, 'Super Rare'),
  ('CHR',    6, 'Character Rare'),
  ('RR',     5, 'Double Rare'),
  ('R_HOLO', 4, 'Rare Holo'),
  ('R',      3, 'Rare'),
  ('UC',     2, 'Uncommon'),
  ('C',      1, 'Common'),
  ('OTHER',  0, 'Other');

-- =============================================================================
-- lots (a "lot" is a physical batch of cards added together)
-- =============================================================================

create table lots (
  id         uuid default gen_random_uuid() primary key,
  photo_url  text,
  created_at timestamptz default now() not null
);

-- =============================================================================
-- cards (main table)
-- =============================================================================

create table cards (
  id uuid default gen_random_uuid() primary key,

  pokemon_name   text not null,
  pokemon_number integer not null check (pokemon_number between 1 and 1025),

  card_name   text not null,
  card_id_tcg text,
  set_name    text,
  set_code    text,
  set_number  text,
  language    card_language not null,
  rarity      card_rarity not null,
  rarity_rank integer not null default 0,
  condition   card_condition not null default 'NM',

  status card_status not null default 'for_sale',

  image_url     text,
  tcg_image_url text,

  cardmarket_id    text,
  cm_price_low     numeric(10, 2),
  cm_price_trend   numeric(10, 2),
  cm_price_avg     numeric(10, 2),
  suggested_price  numeric(10, 2),
  cm_updated_at    timestamptz,

  lot_id uuid references lots (id) on delete set null,

  date_added timestamptz default now() not null,
  date_sold  timestamptz,
  sold_price numeric(10, 2),

  notes text
);

-- Exactly one Pokédex entry per pokemon_number (partial unique index)
create unique index one_pokedex_per_pokemon
  on cards (pokemon_number)
  where status = 'pokedex';

create index idx_cards_status         on cards (status);
create index idx_cards_pokemon_number on cards (pokemon_number);
create index idx_cards_date_added     on cards (date_added asc);
create index idx_cards_card_id_tcg    on cards (card_id_tcg);
create index idx_cards_lot_id         on cards (lot_id);

-- Full-text search across the human-meaningful card fields
create index idx_cards_search on cards using gin (
  to_tsvector(
    'simple',
    coalesce(card_name, '')
      || ' ' || coalesce(pokemon_name, '')
      || ' ' || coalesce(set_name, '')
      || ' ' || coalesce(set_code, '')
      || ' ' || coalesce(set_number, '')
  )
);

-- Trigger: keep rarity_rank in sync with rarity_ranks lookup table
-- (saves callers from having to remember to set it manually)
create or replace function set_rarity_rank() returns trigger as $$
begin
  select rank into new.rarity_rank from rarity_ranks where rarity = new.rarity;
  if new.rarity_rank is null then
    new.rarity_rank := 0;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger cards_set_rarity_rank
  before insert or update of rarity on cards
  for each row execute function set_rarity_rank();

-- =============================================================================
-- config (key/value app settings)
-- =============================================================================

create table config (
  key   text primary key,
  value text not null
);

insert into config (key, value) values
  ('price_coefficient',     '0.85'),
  ('vinted_shipping_note',  'Expédition soignée en toploader + enveloppe rigide. Suivi disponible en option.'),
  ('vinted_seller_note',    'Vendeur sérieux. Questions bienvenues.');

-- =============================================================================
-- RPC: replace_pokedex_card
--
-- Atomically swap the Pokédex entry for a given pokemon_number :
--   - the existing 'pokedex' card moves to old_new_status (for_sale | collection)
--   - the new card becomes 'pokedex'
-- =============================================================================

create or replace function replace_pokedex_card(
  old_card_id uuid,
  old_new_status card_status,
  new_card_id uuid
) returns void as $$
begin
  -- Demote first to free the partial unique index slot, then promote.
  update cards set status = old_new_status where id = old_card_id;
  update cards set status = 'pokedex' where id = new_card_id;
end;
$$ language plpgsql;

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table cards        enable row level security;
alter table lots         enable row level security;
alter table config       enable row level security;
alter table rarity_ranks enable row level security;

-- Mono-user app: any authenticated user has full access.
create policy "authenticated_all"  on cards        for all    to authenticated using (true) with check (true);
create policy "authenticated_all"  on lots         for all    to authenticated using (true) with check (true);
create policy "authenticated_read" on config       for select to authenticated using (true);
create policy "authenticated_read" on rarity_ranks for select to authenticated using (true);

-- =============================================================================
-- Storage buckets (card-photos, lot-photos) — both public-read
-- =============================================================================

insert into storage.buckets (id, name, public)
values
  ('card-photos', 'card-photos', true),
  ('lot-photos',  'lot-photos',  true)
on conflict (id) do nothing;

-- Storage RLS: authenticated user can do everything in our two buckets.
-- Public read is already granted by the `public = true` flag above.
create policy "authenticated_card_photos_all"
  on storage.objects for all to authenticated
  using (bucket_id = 'card-photos')
  with check (bucket_id = 'card-photos');

create policy "authenticated_lot_photos_all"
  on storage.objects for all to authenticated
  using (bucket_id = 'lot-photos')
  with check (bucket_id = 'lot-photos');
