-- Manual archetype override for a game's key-Pokémon sprites. NULL (the
-- default for every game, old and new) means "derive live from raw_log via
-- keyPokemons() every time this game is displayed" — see
-- lib/ptcg/archetype-dex.ts. Setting either column overrides that derivation
-- for this game going forward. Each value is a JSON array of national dex
-- numbers, e.g. [15] or [206, 982], in display order.
alter table ptcg_games add column my_archetype_dex jsonb;
alter table ptcg_games add column opponent_archetype_dex jsonb;
