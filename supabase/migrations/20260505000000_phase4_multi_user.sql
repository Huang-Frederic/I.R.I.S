-- Phase 4 — multi-user : per-user listings + display names + drop legacy columns
-- Spec: docs/superpowers/specs/2026-05-04-phase-4-multi-user-design.md

-- 1. Per-user listings tables (cards + lots)
create table card_listings (
  card_id uuid not null references cards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  listed_at timestamptz not null default now(),
  primary key (card_id, user_id)
);
create index idx_card_listings_user_listed
  on card_listings (user_id, listed_at desc);

create table lot_listings (
  lot_id uuid not null references lots(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  listed_at timestamptz not null default now(),
  primary key (lot_id, user_id)
);
create index idx_lot_listings_user_listed
  on lot_listings (user_id, listed_at desc);

-- 2. Display names table
create table user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null
);

-- 3. Backfill cards.vinted_listed_at / lots.vinted_listed_at → listings tables.
-- Guarded by an exists() check so fresh projects (no auth user with this id)
-- don't error on the FK; on the original install the row is present so the
-- backfill runs as before. The columns being read are dropped at step 5.
insert into card_listings (card_id, user_id, listed_at)
select id, '35385d3c-5966-4a10-8568-8d92d1be47e7'::uuid, vinted_listed_at
from cards
where vinted_listed_at is not null
  and exists (select 1 from auth.users where id = '35385d3c-5966-4a10-8568-8d92d1be47e7');

insert into lot_listings (lot_id, user_id, listed_at)
select id, '35385d3c-5966-4a10-8568-8d92d1be47e7'::uuid, vinted_listed_at
from lots
where vinted_listed_at is not null
  and exists (select 1 from auth.users where id = '35385d3c-5966-4a10-8568-8d92d1be47e7');

-- 4. Seed user_profiles only if the original install's auth users exist
-- (so a fresh Supabase project doesn't fail the FK to auth.users).
-- Fresh installs seed user_profiles manually after creating their own auth
-- users — see docs/SETUP.md §6 "After applying".
insert into user_profiles (user_id, display_name)
select '35385d3c-5966-4a10-8568-8d92d1be47e7'::uuid, 'Lui'
where exists (select 1 from auth.users where id = '35385d3c-5966-4a10-8568-8d92d1be47e7')
on conflict (user_id) do nothing;

insert into user_profiles (user_id, display_name)
select 'a018a4ef-e02e-4a67-9732-9fafe3167e10'::uuid, 'Elle'
where exists (select 1 from auth.users where id = 'a018a4ef-e02e-4a67-9732-9fafe3167e10')
on conflict (user_id) do nothing;

-- 5. Drop old per-card / per-lot vinted_listed_at columns + indexes
drop index if exists idx_cards_vinted_listed_at;
alter table cards drop column vinted_listed_at;
alter table lots drop column vinted_listed_at;

-- 6. RLS
alter table card_listings enable row level security;
alter table lot_listings enable row level security;
alter table user_profiles enable row level security;

create policy card_listings_select on card_listings for select to authenticated using (true);
create policy card_listings_insert on card_listings for insert to authenticated with check (user_id = auth.uid());
create policy card_listings_update on card_listings for update to authenticated using (user_id = auth.uid());
create policy card_listings_delete on card_listings for delete to authenticated using (user_id = auth.uid());

create policy lot_listings_select on lot_listings for select to authenticated using (true);
create policy lot_listings_insert on lot_listings for insert to authenticated with check (user_id = auth.uid());
create policy lot_listings_update on lot_listings for update to authenticated using (user_id = auth.uid());
create policy lot_listings_delete on lot_listings for delete to authenticated using (user_id = auth.uid());

create policy user_profiles_select on user_profiles for select to authenticated using (true);
create policy user_profiles_insert on user_profiles for insert to authenticated with check (user_id = auth.uid());
create policy user_profiles_update on user_profiles for update to authenticated using (user_id = auth.uid());
