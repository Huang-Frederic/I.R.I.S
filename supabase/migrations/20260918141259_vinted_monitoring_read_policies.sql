-- Mirrors agent_heartbeats' existing "authenticated users can read" policy:
-- these tables carry no credentials or PII beyond what card_listings
-- already exposes, so letting either Vinted-enabled partner read the
-- other's bot status lets the monitoring section's account switcher work
-- without a service-role round-trip for every read. Postgres OR's multiple
-- SELECT policies together, so this is additive — Plan A's existing
-- owner-only SELECT policies on these same tables stay in place unchanged.
create policy "authenticated users can read vinted queue"
  on vinted_queue for select to authenticated using (true);

create policy "authenticated users can read vinted bot schedule"
  on vinted_bot_schedule for select to authenticated using (true);

create policy "authenticated users can read vinted bot config"
  on vinted_bot_config for select to authenticated using (true);

create policy "authenticated users can read vinted agent logs"
  on vinted_agent_logs for select to authenticated using (true);
