-- Optional end time/date for a store event (e.g. Play-in "De 14:30 à 19:00").
-- NULL for single-instant events (most tournaments).
ALTER TABLE store_events ADD COLUMN IF NOT EXISTS ends_at timestamptz;
