-- Add 'CN' to card_language enum (replaces 'ZH' going forward).
-- Postgres doesn't allow dropping enum values cleanly, so 'ZH' stays as a
-- deprecated value — never written by the app. Existing rows (if any) are
-- migrated to 'CN' below; future inserts always use 'CN'.

alter type card_language add value if not exists 'CN' before 'ZH';

-- Migrate any existing rows. After the wipe both tables are empty, but the
-- statements are idempotent and safe to run on a populated DB later.
update cards set language = 'CN' where language = 'ZH';
update tcg_catalog set language = 'CN' where language = 'ZH';
