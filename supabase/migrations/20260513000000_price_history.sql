-- Per-card daily price snapshots with downsampling (daily → weekly → monthly).
-- Spec: docs/superpowers/specs/2026-05-13-price-history-design.md

create table price_history (
  card_id uuid not null references cards (id) on delete cascade,
  bucket_date date not null,
  granularity text not null check (granularity in ('daily', 'weekly', 'monthly')),
  cm_price_low numeric(10, 2),
  cm_price_trend numeric(10, 2),
  cm_price_avg numeric(10, 2),
  source_freshness_days int,
  created_at timestamptz not null default now(),
  primary key (card_id, granularity, bucket_date)
);

create index idx_price_history_card_date
  on price_history (card_id, bucket_date desc);

create index idx_price_history_recent_daily
  on price_history (card_id, bucket_date desc)
  where granularity = 'daily';

-- RLS: read-only for any authenticated user; writes only via service-role.
alter table price_history enable row level security;

create policy price_history_read on price_history
  for select using (auth.uid() is not null);

-- Downsampling function: daily>90d → weekly (median), weekly>365d → monthly (median).
create or replace function downsample_price_history()
returns void
language plpgsql
security invoker
as $$
begin
  -- 1. daily → weekly (Mondays as bucket key). Atomic: delete daily rows >90d
  --    in a CTE, aggregate them by week, insert as weekly. Median of price
  --    columns is robust to spikes (single outlier transaction can't skew).
  with old_daily as (
    delete from price_history
     where granularity = 'daily'
       and bucket_date < current_date - interval '90 days'
    returning *
  )
  insert into price_history
    (card_id, bucket_date, granularity, cm_price_low, cm_price_trend, cm_price_avg, source_freshness_days)
  select
    card_id,
    date_trunc('week', bucket_date)::date as week_start,
    'weekly',
    percentile_cont(0.5) within group (order by cm_price_low),
    percentile_cont(0.5) within group (order by cm_price_trend),
    percentile_cont(0.5) within group (order by cm_price_avg),
    round(avg(source_freshness_days))::int
  from old_daily
  group by card_id, week_start
  on conflict (card_id, granularity, bucket_date) do nothing;

  -- 2. weekly → monthly (1st of month as bucket key). Same atomic pattern.
  with old_weekly as (
    delete from price_history
     where granularity = 'weekly'
       and bucket_date < current_date - interval '365 days'
    returning *
  )
  insert into price_history
    (card_id, bucket_date, granularity, cm_price_low, cm_price_trend, cm_price_avg, source_freshness_days)
  select
    card_id,
    date_trunc('month', bucket_date)::date as month_start,
    'monthly',
    percentile_cont(0.5) within group (order by cm_price_low),
    percentile_cont(0.5) within group (order by cm_price_trend),
    percentile_cont(0.5) within group (order by cm_price_avg),
    round(avg(source_freshness_days))::int
  from old_weekly
  group by card_id, month_start
  on conflict (card_id, granularity, bucket_date) do nothing;
end;
$$;

-- Schedule via pg_cron: every Sunday at 04:00 UTC.
-- Requires the pg_cron extension to be enabled on the Supabase project.
select cron.schedule(
  'downsample-price-history',
  '0 4 * * 0',
  $$select downsample_price_history();$$
);
