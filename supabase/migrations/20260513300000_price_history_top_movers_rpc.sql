-- Top hausses / top baisses for the /prices TopMoversPanel.
-- Returns top 10 cards (sorted by delta percentage) with current_avg, base_avg
-- (price ≤ N days ago), and delta_pct. Filter cm_price_avg >= 1€ to avoid
-- low-price cards spamming the top with +100% from rounding noise.
-- Spec: docs/superpowers/specs/2026-05-13-price-history-design.md

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
      case when b.base_avg = 0 then 0
           else (l.last_avg - b.base_avg) / b.base_avg * 100
      end as delta_pct
    from last_per_card l
    join base_per_card b on b.card_id = l.card_id
    where l.last_avg >= 1.0   -- filter cards under 1€ to avoid noise
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
