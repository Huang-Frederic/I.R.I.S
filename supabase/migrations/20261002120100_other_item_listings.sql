-- supabase/migrations/20261002120100_other_item_listings.sql
-- Mirrors card_listings/lot_listings exactly (see
-- supabase/migrations/20260505000000_phase4_multi_user.sql,
-- 20260609000000_vinted_columns_per_user.sql,
-- 20260921135551_vinted_repost_position.sql), except select is Fred-only
-- (card_listings/lot_listings use `using (true)` — open read — since those
-- are genuinely shared; other_item_listings is not).

create table other_item_listings (
  other_item_id     uuid not null references other_items(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  listed_at         timestamptz not null default now(),
  vinted_listing_id text,
  vinted_posted_at  timestamptz,
  repost_position   integer,
  primary key (other_item_id, user_id)
);
create index idx_other_item_listings_user_listed
  on other_item_listings (user_id, listed_at desc);

alter table other_item_listings enable row level security;

create policy other_item_listings_select on other_item_listings
  for select to authenticated using (auth.uid() = '35385d3c-5966-4a10-8568-8d92d1be47e7');
create policy other_item_listings_insert on other_item_listings
  for insert to authenticated with check (user_id = auth.uid() and auth.uid() = '35385d3c-5966-4a10-8568-8d92d1be47e7');
create policy other_item_listings_update on other_item_listings
  for update to authenticated using (user_id = auth.uid() and auth.uid() = '35385d3c-5966-4a10-8568-8d92d1be47e7');
create policy other_item_listings_delete on other_item_listings
  for delete to authenticated using (user_id = auth.uid() and auth.uid() = '35385d3c-5966-4a10-8568-8d92d1be47e7');
