-- Persists who went first, so Battle Logs' list row can show a 1st/2nd badge
-- without re-fetching and re-parsing every game's raw_log (~30KB each) just to
-- render a list. Nullable: existing games predate this column and stay null
-- until backfilled; a null renders with no badge, same as "unclassified".
alter table ptcg_games add column went_first boolean;
