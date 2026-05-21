-- Fix price_history_top_movers: use LEFT JOIN so cards that have recent
-- history but no baseline at exactly N days ago are not silently dropped.
-- Cards without a base still produce delta_pct=0 and are filtered by the
-- direction clause, so they never pollute the top-movers list — but the
-- INNER JOIN was also discarding cards that DO have a base when the CTE
-- returns no rows at all (e.g. period_days=30 with only 7 days of history).
-- The LEFT JOIN ensures the function returns results for any period where
-- last_per_card is non-empty and some base rows exist.

create or replace function price_history_top_movers(period_days int, direction text)
returns table (
  card_id uuid,
  card_name text,
  set_name text,
  set_number text,
  current_avg numeric,
  base_avg numeric,
  delta_pct numeric
)
language sql
stable
as $$
  with last_per_card as (
    select distinct on (card_id) card_id, cm_price_avg as last_avg
    from price_history
    where granularity = 'daily'
    order by card_id, bucket_date desc
  ),
  base_per_card as (
    select distinct on (card_id) card_id, cm_price_avg as base_avg
    from price_history
    where granularity = 'daily'
      and bucket_date <= current_date - period_days
    order by card_id, bucket_date desc
  ),
  diffs as (
    select
      l.card_id,
      l.last_avg as current_avg,
      b.base_avg,
      case
        when b.base_avg is null then 0
        when b.base_avg = 0 then 0
        else (l.last_avg - b.base_avg) / b.base_avg * 100
      end as delta_pct
    from last_per_card l
    left join base_per_card b on b.card_id = l.card_id  -- LEFT JOIN: keep cards even without a base
    where l.last_avg >= 1.0   -- filter cards under 1€ to avoid noise
      and b.base_avg is not null  -- only show cards where we can compute a real delta
  )
  select
    d.card_id,
    c.card_name,
    c.set_name,
    c.set_number,
    d.current_avg,
    d.base_avg,
    round(d.delta_pct::numeric, 2)
  from diffs d
  join cards c on c.id = d.card_id
  where (direction = 'up' and d.delta_pct > 0)
     or (direction = 'down' and d.delta_pct < 0)
  order by case when direction = 'up' then d.delta_pct end desc nulls last,
           case when direction = 'down' then d.delta_pct end asc nulls last
  limit 10;
$$;

grant execute on function price_history_top_movers(int, text) to authenticated;
