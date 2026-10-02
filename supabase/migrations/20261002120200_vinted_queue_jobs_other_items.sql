-- supabase/migrations/20261002120200_vinted_queue_jobs_other_items.sql
-- Extends vinted_queue and vinted_post_jobs to a third target type, the
-- same way 20260615000000_vinted_lot_support.sql added lot_id alongside
-- card_id.

alter table vinted_queue
  add column other_item_id uuid references other_items(id) on delete cascade;

-- Dynamically find and drop the original 2-way `num_nonnulls` check — its
-- auto-generated name depends on how many other unnamed checks already
-- exist on vinted_queue, so a guessed literal name is not safe: if the
-- guess is wrong, the old 2-way check (card_id, lot_id) survives alongside
-- the new 3-way one and rejects every valid other_item-only row (0 of the
-- 2 columns it checks would be non-null).
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'vinted_queue'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%num_nonnulls%'
  loop
    execute format('alter table vinted_queue drop constraint %I', c.conname);
  end loop;
end $$;

alter table vinted_queue
  add constraint vinted_queue_one_target check (num_nonnulls(card_id, lot_id, other_item_id) = 1);

alter table vinted_queue
  add constraint vinted_queue_user_other_item_unique unique (user_id, other_item_id);

alter table vinted_post_jobs
  add column other_item_id uuid references other_items(id) on delete cascade;

alter table vinted_post_jobs
  drop constraint if exists vinted_post_jobs_one_target;
alter table vinted_post_jobs
  add constraint vinted_post_jobs_one_target check (num_nonnulls(card_id, lot_id, other_item_id) = 1);

create index idx_vinted_post_jobs_other_item_id
  on vinted_post_jobs(other_item_id) where other_item_id is not null;

-- Extend vinted_post_jobs' RLS to also allow other_item job ownership.
--
-- DEVIATION FROM THE TASK-3 BRIEF: the brief's draft of this policy
-- reinstated the card_listings/lot_listings *existence-check* shape from
-- 20260615000000_vinted_lot_support.sql
-- ("card_id in (select ... from card_listings ...) or lot_id in
-- (select ... from lot_listings ...)"), citing that migration as "the
-- policy this replaces". That shape was NOT the current one — it was
-- deliberately replaced (not just extended) by two later migrations:
--   - 20260616100000_vinted_lot_job_rls_fix.sql: dropped the lot_listings
--     check because lot_listings only gets a row AFTER the Vinted agent's
--     first successful post, so the chicken-and-egg check blocked every
--     first-time lot post job.
--   - 20260616110000_vinted_post_jobs_rls_v2.sql: dropped the matching
--     card_listings check for the identical reason. This is the version
--     still live today — confirmed immediately before writing this
--     migration via `npx supabase db query --linked` against pg_policies:
--     the live with_check is exactly
--       (user_id = auth.uid()) AND (card_id IS NOT NULL OR lot_id IS NOT NULL)
--     with no card_listings/lot_listings lookup at all.
-- other_item_listings has the exact same row-creation timing as
-- card_listings/lot_listings (a row only appears after a successful Vinted
-- post — see 20261002120100_other_item_listings.sql), so reinstating the
-- existence-check shape for other_item_id would reintroduce the identical
-- bug for the very first post job of every other_item. This is a live risk,
-- not a theoretical one: app/api/vinted/post-job/route.ts and
-- app/api/vinted/bump-job/route.ts both insert into vinted_post_jobs
-- through the end user's own cookie-session (anon-key) Supabase client, so
-- this WITH CHECK clause is genuinely enforced in production, not dead code
-- behind a service-role bypass.
-- This migration instead extends the live policy's actual shape (ownership
-- + "exactly one target column is set", no listings-table lookup) to the
-- third target type.
drop policy if exists "Users can manage their own post jobs" on vinted_post_jobs;
create policy "Users can manage their own post jobs"
  on vinted_post_jobs
  for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (card_id is not null or lot_id is not null or other_item_id is not null)
  );
