-- Aggregate stats over price_history for the /prices StatsHeader.
-- Computes per-card cascade-equivalent delta (latest vs. point ≤ N days ago)
-- within the requested period, then returns counts of up/down/stable + mean
-- volatility (coefficient of variation) over the same window.
-- Spec: docs/superpowers/specs/2026-05-13-price-history-design.md

create or replace function price_history_global_stats(period_days int)
returns table (
  cards_up int,
  cards_down int,
  cards_stable int,
  mean_volatility_pct numeric
)
language sql
stable
as $$
  with last_per_card as (
    select distinct on (card_id)
      card_id, cm_price_avg as last_avg
    from price_history
    where granularity = 'daily'
    order by card_id, bucket_date desc
  ),
  base_per_card as (
    select distinct on (card_id)
      card_id, cm_price_avg as base_avg
    from price_history
    where granularity = 'daily'
      and bucket_date <= current_date - period_days
    order by card_id, bucket_date desc
  ),
  diffs as (
    select
      l.card_id,
      l.last_avg,
      b.base_avg,
      case
        when b.base_avg is null then null
        when abs(l.last_avg - b.base_avg) < 0.01 then 0
        when l.last_avg > b.base_avg then 1
        else -1
      end as direction
    from last_per_card l
    left join base_per_card b on b.card_id = l.card_id
  ),
  vol as (
    select card_id,
           case when avg(cm_price_avg) = 0 then 0
                else stddev_pop(cm_price_avg) / avg(cm_price_avg) * 100
           end as vol_pct
    from price_history
    where granularity = 'daily'
      and bucket_date >= current_date - period_days
    group by card_id
    having count(*) >= 2
  )
  select
    count(*) filter (where direction = 1)::int   as cards_up,
    count(*) filter (where direction = -1)::int  as cards_down,
    count(*) filter (where direction = 0)::int   as cards_stable,
    coalesce(round(avg(vol.vol_pct)::numeric, 2), 0) as mean_volatility_pct
  from diffs
  left join vol on vol.card_id = diffs.card_id;
$$;

grant execute on function price_history_global_stats(int) to authenticated;
