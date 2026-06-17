-- Add Vinted catalog/brand metadata to lots.
-- This lets "Other" items (non-Pokémon goodies, other TCG) be posted with the
-- correct category and brand on Vinted instead of always using Pokémon defaults.
-- NULL = use Python agent defaults (POKEMON_CATALOG_ID / POKEMON_BRAND_ID).
ALTER TABLE lots
  ADD COLUMN IF NOT EXISTS catalog_id  integer,
  ADD COLUMN IF NOT EXISTS brand_id    integer,
  ADD COLUMN IF NOT EXISTS brand_name  text;
