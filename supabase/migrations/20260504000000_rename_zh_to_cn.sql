-- Add 'CN' to card_language enum (replaces 'ZH' going forward).
-- Postgres doesn't allow dropping enum values cleanly, so 'ZH' stays as a
-- deprecated value — never written by the app. Existing rows (if any) are
-- migrated to 'CN' below; future inserts always use 'CN'.

alter type card_language add value if not exists 'CN' before 'ZH';

-- Migrate any existing rows. Postgres refuses to use an enum value inside the
-- transaction that added it (SQLSTATE 55P04), and the CLI applies a migration
-- file as one transaction, so the updates run as dynamic SQL and only when
-- there is a row to move: a fresh database (supabase db reset) skips them.
do $$
begin
  if exists (select 1 from cards where language::text = 'ZH') then
    execute $q$update cards set language = 'CN' where language = 'ZH'$q$;
  end if;
  if exists (select 1 from tcg_catalog where language::text = 'ZH') then
    execute $q$update tcg_catalog set language = 'CN' where language = 'ZH'$q$;
  end if;
end $$;
