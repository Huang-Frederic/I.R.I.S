-- Optional manual override for repost ordering, set via the monitoring
-- UI's drag-and-drop (mirrors vinted_queue.position for new posts). NULL
-- means "no preference" — the bot falls back to reposting the oldest
-- listing first, exactly as it does today (see
-- vinted-agent/scheduler.py's sort_repost_candidates).
alter table card_listings add column repost_position integer;
alter table lot_listings  add column repost_position integer;
