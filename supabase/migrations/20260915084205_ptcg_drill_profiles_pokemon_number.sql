-- Drill profiles get a Pokémon sprite the user picks by name (FR/EN) in the
-- profile form. Nullable at the DB level so the pre-existing "Beedrill Test"
-- profile isn't broken by this migration — the app enforces "required" for
-- every new/edited profile going forward, at the form and API layers.
alter table ptcg_drill_profiles add column pokemon_number integer;
