-- Optional remaining-spots count for a store event (Play-in "8 places
-- restantes", Parkage "13 tickets available"). NULL when the source doesn't
-- expose it. 0 = full.
ALTER TABLE store_events ADD COLUMN IF NOT EXISTS spots_left integer;
