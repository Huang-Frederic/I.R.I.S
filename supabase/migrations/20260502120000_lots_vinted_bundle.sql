-- supabase/migrations/20260502120000_lots_vinted_bundle.sql
-- Phase 3b1: extend lots table from minimal scaffold (id, photo_url, created_at)
-- to a full Vinted-listing entity (bundle of cards sold as one item).

alter table lots
  add column name text not null default '',
  add column language card_language,
  add column condition card_condition default 'NM',
  add column extra_description text,
  add column price numeric(10, 2),
  add column status text default 'for_sale'
    check (status in ('for_sale', 'sold')),
  add column date_sold timestamptz,
  add column sold_price numeric(10, 2),
  add column vinted_listed_at timestamptz,
  add column photo_urls jsonb default '[]'::jsonb,
  add column date_added timestamptz default now();

create index idx_lots_status on lots(status);
create index idx_lots_date_added on lots(date_added);
create index idx_lots_vinted_listed on lots(vinted_listed_at) where vinted_listed_at is not null;
