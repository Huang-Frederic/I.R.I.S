-- Allow non-Pokémon cards (Trainers, Energies, Stadium, Tools) to live
-- without a pokemon_name. The previous catalog scraper backfilled
-- pokemon_name = card_name for Trainers (because the column was NOT NULL
-- at the time), which caused redundant display in the scanner form
-- ("Nom Pokémon: Nの筋書き" identical to "Nom carte: Nの筋書き").
--
-- Sister of 20260506140000_pokemon_number_nullable.sql.
alter table cards alter column pokemon_name drop not null;
