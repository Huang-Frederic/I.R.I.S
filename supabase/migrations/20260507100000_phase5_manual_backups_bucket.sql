-- supabase/migrations/20260507100000_phase5_manual_backups_bucket.sql
-- Phase 5 — private bucket for manual backups triggered from /options.

insert into storage.buckets (id, name, public)
values ('manual-backups', 'manual-backups', false)
on conflict (id) do nothing;

-- No RLS policies on storage.objects for this bucket → only service-role
-- access (matches the design: API routes use service client to dump/list).
