-- Distinguishes a job the automatic scheduler created (the 5-minute loop in
-- vinted-agent/main.py's _scheduling_loop) from one a manual "Poster/Reposter
-- maintenant" or "Bump" click created — so the dashboard's daily quota (a
-- target for the AUTOMATIC posting cadence) doesn't get inflated by
-- on-demand actions the user explicitly chose to take outside that cadence.
alter table vinted_post_jobs
  add column triggered_by text not null default 'schedule'
    check (triggered_by in ('schedule', 'manual'));
