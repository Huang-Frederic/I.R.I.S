-- ptcg_games — the play score shown in the history.
--
-- Derived from the analysis at import (see lib/ptcg/score.ts): each of the
-- player's turns starts at 100 and is moved by the findings on it. The
-- judgement lives in those findings; the number is arithmetic on top, so two
-- games are comparable and a score can be argued with turn by turn.
--
-- Stored rather than computed on read because the list page does not load the
-- game state, and scoring needs to know which turns were the player's — the
-- turn list alternates, and averaging over both sides halves every penalty.
--
-- Nullable: a game imported without an analysis has nothing to score, and rows
-- imported before this migration keep NULL until re-imported.

ALTER TABLE ptcg_games
  ADD COLUMN IF NOT EXISTS play_score integer
    CHECK (play_score IS NULL OR play_score BETWEEN 0 AND 100);
