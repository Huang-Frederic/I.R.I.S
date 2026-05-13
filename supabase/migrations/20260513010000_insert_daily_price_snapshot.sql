-- Idempotent daily snapshot RPC — copies cards.cm_price_avg into price_history
-- for every priceable card. ON CONFLICT keeps the snapshot cron safely
-- re-runnable within the same day. Returns the count of rows touched.
-- Spec: docs/superpowers/specs/2026-05-13-price-history-design.md

create or replace function insert_daily_price_snapshot()
returns int
language plpgsql
security invoker
as $$
declare
  inserted_count int;
begin
  with upsert as (
    insert into price_history
      (card_id, bucket_date, granularity, cm_price_low, cm_price_trend, cm_price_avg, source_freshness_days)
    select
      id, current_date, 'daily',
      cm_price_low, cm_price_trend, cm_price_avg,
      extract(day from (now() - cm_updated_at))::int
    from cards
    where status in ('for_sale', 'collection', 'pokedex')
      and cm_price_avg is not null
    on conflict (card_id, granularity, bucket_date) do update
      set cm_price_low = excluded.cm_price_low,
          cm_price_trend = excluded.cm_price_trend,
          cm_price_avg = excluded.cm_price_avg,
          source_freshness_days = excluded.source_freshness_days
    returning 1
  )
  select count(*) into inserted_count from upsert;
  return inserted_count;
end;
$$;
