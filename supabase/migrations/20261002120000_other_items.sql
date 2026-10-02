-- supabase/migrations/20261002120000_other_items.sql
-- Non-card Vinted products (clothes, accessories, electronics...). Fred-only
-- — unlike cards/lots, which both users share, this table is scoped to a
-- single hardcoded user id in every RLS policy, not the usual
-- `user_id = auth.uid()` ownership check, because the requirement is
-- "Gilly can't use this at all," not "can't see Fred's rows."

create table other_items (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users on delete cascade,
  name                text not null,
  description         text not null default '',
  price               numeric(10, 2),
  photo_urls          jsonb not null default '[]'::jsonb,
  vinted_catalog_id   integer not null,
  vinted_catalog_path text not null,
  brand_name          text,
  vinted_condition_id smallint not null check (vinted_condition_id between 1 and 5),
  size                text,
  status              text not null default 'for_sale' check (status in ('for_sale', 'collection', 'sold')),
  date_sold           timestamptz,
  sold_price          numeric(10, 2),
  vinted_listed_at    timestamptz,
  date_added          timestamptz not null default now()
);

create index idx_other_items_status on other_items(status);
create index idx_other_items_user on other_items(user_id);

alter table other_items enable row level security;

create policy "fred only other_items select" on other_items
  for select to authenticated using (auth.uid() = '35385d3c-5966-4a10-8568-8d92d1be47e7');
create policy "fred only other_items insert" on other_items
  for insert to authenticated with check (auth.uid() = '35385d3c-5966-4a10-8568-8d92d1be47e7');
create policy "fred only other_items update" on other_items
  for update to authenticated using (auth.uid() = '35385d3c-5966-4a10-8568-8d92d1be47e7');
create policy "fred only other_items delete" on other_items
  for delete to authenticated using (auth.uid() = '35385d3c-5966-4a10-8568-8d92d1be47e7');

-- Storage bucket, Fred-only (unlike card-photos/lot-photos, which grant
-- `using (bucket_id = '...')` with no user check at all — see
-- supabase/migrations/20260425224142_initial_schema.sql).
insert into storage.buckets (id, name, public)
values ('other-item-photos', 'other-item-photos', true)
on conflict (id) do nothing;

create policy "fred only other_item_photos"
  on storage.objects for all to authenticated
  using (bucket_id = 'other-item-photos' and auth.uid() = '35385d3c-5966-4a10-8568-8d92d1be47e7')
  with check (bucket_id = 'other-item-photos' and auth.uid() = '35385d3c-5966-4a10-8568-8d92d1be47e7');
