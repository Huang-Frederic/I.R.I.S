-- Phase 5 — Dashboard data collection tables.
-- Spec: docs/superpowers/plans/2026-05-07-phase5-dashboard-backups.md

-- 1. OCR usage log (for cost tracking + token consumption)
create table ocr_usage_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  engine text not null check (engine in ('gemini', 'vision')),
  tokens_in int,
  tokens_out int,
  cost_eur numeric(10, 6) not null default 0,
  card_id uuid references cards (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null
);

create index ocr_usage_log_created_at_idx on ocr_usage_log (created_at desc);

-- 2. Stock value snapshots (daily snapshot of portfolio value)
create table stock_value_snapshots (
  date date primary key,
  value_for_sale numeric(12, 2) not null default 0,
  value_collection numeric(12, 2) not null default 0,
  count_for_sale int not null default 0,
  count_collection int not null default 0,
  created_at timestamptz not null default now()
);

-- 3. RLS policies
alter table ocr_usage_log enable row level security;
alter table stock_value_snapshots enable row level security;

-- Reads shared between both users (cost is common data).
-- Writes only via service-role (server-side OCR route).
create policy ocr_usage_log_read on ocr_usage_log
  for select using (auth.uid() is not null);

create policy stock_value_snapshots_read on stock_value_snapshots
  for select using (auth.uid() is not null);
