-- supabase/migrations/20261005120100_vinted_queue_failure_flag.sql
-- The scheduler and the manual "Poster maintenant" route both delete an
-- item's vinted_queue row as soon as they create its post job, and nothing
-- put it back when the job failed: a timeout or a Vinted validation error
-- silently dropped the item out of the queue, still for sale but never
-- listed. The bot now re-queues it at the front (vinted-agent/main.py,
-- _requeue_after_failure).
--
-- When the failure is the listing's own data (Vinted rejected it, or a
-- required attribute is missing), retrying unchanged can't succeed, so the
-- row is flagged: the scheduler skips flagged rows, the monitoring grid shows
-- `last_error`, and editing the item (PATCH /api/other-items/[id]) or posting
-- it manually clears the flag. Without the skip, one broken item at the head
-- of the queue would burn the whole daily quota retrying itself.

alter table vinted_queue add column last_error text;
alter table vinted_queue add column failed_at timestamptz;
