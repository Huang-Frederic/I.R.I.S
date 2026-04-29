-- I.R.I.S — Add variant column to cards
-- Optional special-printing flag (Pokéball / Masterball patterns on reverse
-- holos, classic reverse, promo). NULL = standard card. Free text for future
-- variants without requiring a schema change.

alter table cards add column variant text;
