-- supabase/migrations/20261005120200_vinted_catalog_attributes.sql
-- Per-category Vinted listing attributes for the other_items form: the
-- category's size options (grouped, e.g. S/M/L / EU / UK for women's
-- clothing), whether a size is required, its accepted conditions, and
-- whether it asks for a color.
--
-- Vinted only serves these one category at a time, through an authenticated
-- session (POST /api/v2/item_upload/attributes) — the app can't call it
-- (no session, and a second client rotating the session's tokens would kill
-- the bot's). So the app inserts a 'pending' row and the bot, which holds
-- the session, fills it in (vinted-agent/main.py, _attribute_requests_loop).
-- The bot also refreshes a category's row every time it posts in it.
--
-- Fred-only, like other_items itself (20261002120000_other_items.sql) — the
-- requirement is that Gilly can't tell the feature exists.

create table if not exists vinted_catalog_attributes (
  catalog_id        integer primary key,
  status            text not null default 'pending' check (status in ('pending', 'ready', 'error')),
  requested_by      uuid default auth.uid() references auth.users on delete set null,
  -- [{"title": "S/M/L", "options": [{"id": 1740, "title": "L"}, ...]}, ...];
  -- null when the category has no size attribute at all.
  size_options      jsonb,
  size_required     boolean not null default false,
  -- [{"id": 6, "title": "Neuf avec étiquette"}, ...]
  condition_options jsonb not null default '[]'::jsonb,
  has_color         boolean not null default false,
  error             text,
  requested_at      timestamptz not null default now(),
  fetched_at        timestamptz
);

alter table vinted_catalog_attributes enable row level security;

drop policy if exists "fred only vinted_catalog_attributes select" on vinted_catalog_attributes;
create policy "fred only vinted_catalog_attributes select" on vinted_catalog_attributes
  for select to authenticated using (auth.uid() = '35385d3c-5966-4a10-8568-8d92d1be47e7');
drop policy if exists "fred only vinted_catalog_attributes insert" on vinted_catalog_attributes;
create policy "fred only vinted_catalog_attributes insert" on vinted_catalog_attributes
  for insert to authenticated with check (auth.uid() = '35385d3c-5966-4a10-8568-8d92d1be47e7');
drop policy if exists "fred only vinted_catalog_attributes update" on vinted_catalog_attributes;
create policy "fred only vinted_catalog_attributes update" on vinted_catalog_attributes
  for update to authenticated using (auth.uid() = '35385d3c-5966-4a10-8568-8d92d1be47e7');
