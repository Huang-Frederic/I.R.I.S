-- supabase/migrations/20261026100200_realtime_lot_and_other_item_listings.sql
-- useRealtimeListingsRefresh (components/vinted/hooks/useRealtimeListingsRefresh.ts)
-- only ever subscribed to card_listings changes — lot_listings and
-- other_item_listings were never added to the supabase_realtime publication
-- by any migration, so a partner's sold-item cross-delete on one of our lots
-- or Items never reached our already-open /vinted tab: the row was correctly
-- deleted server-side, but the page kept showing it as "À retirer" until a
-- manual reload. card_listings is included here too, idempotently, in case
-- it was only ever added through the dashboard rather than tracked here.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'card_listings'
  ) then
    alter publication supabase_realtime add table card_listings;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'lot_listings'
  ) then
    alter publication supabase_realtime add table lot_listings;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'other_item_listings'
  ) then
    alter publication supabase_realtime add table other_item_listings;
  end if;
end $$;
