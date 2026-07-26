-- ptcg_games — remember which Pokémon carried each side.
--
-- The history list shows a game as a matchup: two card images facing each
-- other with the score between them. Deriving that at read time would mean
-- loading `state` for every row — roughly a megabyte each — so the import
-- derives it once and stores the two card ids.
--
-- These also give `my_archetype` / `opponent_archetype` real values. Until now
-- the list fell back to the player's handle, and "Bklee219" says nothing about
-- what the game was against.
--
-- Nullable: a game that ended before anyone attacked has no protagonist, and
-- rows imported before this migration keep NULL until re-imported.

ALTER TABLE ptcg_games
  ADD COLUMN IF NOT EXISTS my_key_card       text,  -- ptcgl_id, joins ptcg_cards
  ADD COLUMN IF NOT EXISTS opponent_key_card text;
