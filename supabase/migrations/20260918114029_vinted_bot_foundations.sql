-- Marks that the CURRENT user, not a background price-enrichment cron, is
-- the one who set/reviewed cards.suggested_price. suggested_price is
-- auto-computed from cm_price_trend on every card insert/re-research (see
-- app/api/cards/route.ts) — non-null alone does not mean "the user looked
-- at this and is happy to sell at this price". Only a card with this set
-- is eligible for the autonomous posting queue.
alter table cards add column price_confirmed_at timestamptz;

-- The manually-ordered "new posts" queue, one row per (user, card-or-lot)
-- eligible for autonomous posting. Populated/depopulated by application
-- code (lib/vinted/queue-sync.ts), not a trigger — kept in the same
-- language and test framework as the rest of the eligibility logic.
create table vinted_queue (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  card_id     uuid references cards on delete cascade,
  lot_id      uuid references lots on delete cascade,
  position    integer not null,
  created_at  timestamptz not null default now(),
  check (num_nonnulls(card_id, lot_id) = 1),
  unique (user_id, card_id),
  unique (user_id, lot_id)
);
create index idx_vinted_queue_user_position on vinted_queue (user_id, position);

alter table vinted_queue enable row level security;
create policy "own vinted queue select"
  on vinted_queue for select to authenticated using (user_id = auth.uid());
create policy "own vinted queue insert"
  on vinted_queue for insert to authenticated with check (user_id = auth.uid());
create policy "own vinted queue update"
  on vinted_queue for update to authenticated using (user_id = auth.uid());
create policy "own vinted queue delete"
  on vinted_queue for delete to authenticated using (user_id = auth.uid());

-- Posting/reposting windows, per user, per day of week. A day with no rows
-- means no autonomous post/repost that day — "paused on weekends" is just
-- the absence of rows for day_of_week 0 and 6, not a special flag.
create table vinted_bot_schedule (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0 = Sunday
  starts_at   time not null,
  ends_at     time not null,
  check (ends_at > starts_at)
);
create index idx_vinted_bot_schedule_user_day on vinted_bot_schedule (user_id, day_of_week);

alter table vinted_bot_schedule enable row level security;
create policy "own vinted schedule select"
  on vinted_bot_schedule for select to authenticated using (user_id = auth.uid());
create policy "own vinted schedule insert"
  on vinted_bot_schedule for insert to authenticated with check (user_id = auth.uid());
create policy "own vinted schedule update"
  on vinted_bot_schedule for update to authenticated using (user_id = auth.uid());
create policy "own vinted schedule delete"
  on vinted_bot_schedule for delete to authenticated using (user_id = auth.uid());

-- One row per user: daily post/repost quota and the repost staleness
-- threshold. Both configurable from the monitoring UI (next plan).
create table vinted_bot_config (
  user_id            uuid primary key references auth.users on delete cascade,
  daily_quota        smallint not null default 8 check (daily_quota > 0),
  repost_after_days  smallint not null default 14 check (repost_after_days > 0),
  updated_at         timestamptz not null default now()
);

alter table vinted_bot_config enable row level security;
create policy "own vinted bot config select"
  on vinted_bot_config for select to authenticated using (user_id = auth.uid());
create policy "own vinted bot config insert"
  on vinted_bot_config for insert to authenticated with check (user_id = auth.uid());
create policy "own vinted bot config update"
  on vinted_bot_config for update to authenticated using (user_id = auth.uid());

-- Replaces the local cookies_*.json files as the source of truth for the
-- agent's Vinted session. Pasted as raw JSON from the monitoring UI (next
-- plan); the agent syncs this down to its local file cache before each job.
create table vinted_sessions (
  user_id     uuid primary key references auth.users on delete cascade,
  cookies     jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table vinted_sessions enable row level security;
create policy "own vinted session select"
  on vinted_sessions for select to authenticated using (user_id = auth.uid());
create policy "own vinted session insert"
  on vinted_sessions for insert to authenticated with check (user_id = auth.uid());
create policy "own vinted session update"
  on vinted_sessions for update to authenticated using (user_id = auth.uid());

-- Mirror of the agent's console log, for the monitoring UI (next plan) to
-- display without needing access to the machine it runs on.
create table vinted_agent_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users on delete cascade,
  level       text not null check (level in ('info', 'warn', 'error')),
  message     text not null,
  created_at  timestamptz not null default now()
);
create index idx_vinted_agent_logs_user_created on vinted_agent_logs (user_id, created_at desc);

alter table vinted_agent_logs enable row level security;
create policy "own vinted agent logs select"
  on vinted_agent_logs for select to authenticated using (user_id = auth.uid());
-- Inserted only by the agent via the service-role key, which bypasses RLS —
-- no insert/update policy needed for authenticated users.

-- 'delete' supports the cross-user sold-conflict sync: removes an ad
-- without reposting, unlike 'repost' (which already deletes then reposts —
-- see vinted-agent/main.py's process_job/process_lot_job).
alter table vinted_post_jobs drop constraint vinted_post_jobs_job_type_check;
alter table vinted_post_jobs add constraint vinted_post_jobs_job_type_check
  check (job_type in ('post', 'repost', 'delete'));
