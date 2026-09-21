-- Missed in the original monitoring read-policies migration — vinted_post_jobs
-- also needs cross-user SELECT so the monitoring section's account switcher
-- can show a partner's real today's-job-count instead of always 0 (RLS was
-- silently filtering their rows to nothing, no error, no visible symptom).
-- Mirrors the same additive pattern already used for vinted_queue/
-- vinted_bot_schedule/vinted_bot_config/vinted_agent_logs.
create policy "authenticated users can read vinted post jobs"
  on vinted_post_jobs for select to authenticated using (true);
