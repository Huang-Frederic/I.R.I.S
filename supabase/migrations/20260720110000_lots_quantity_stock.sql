-- Lots: quantity (number of identical copies) + a stock status.
--
-- quantity — unlike cards (one row per physical copy, grouped client-side),
-- lots keep ONE row with a quantity column: a lot has its own photo set and
-- per-user listings tied to lot_id, so duplicating rows would duplicate both.
-- Selling one copy of a quantity>1 lot SPLITS the row server-side (see
-- /api/lots/[id]): a quantity-1 sold clone is inserted for history and the
-- original decrements, keeping its listings.
--
-- status — 'collection' joins the CHECK so a lot can live in Stock like a
-- card ('collection' matches the cards enum vocabulary; the UI says "Stock").

ALTER TABLE lots
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 1);

ALTER TABLE lots DROP CONSTRAINT IF EXISTS lots_status_check;
ALTER TABLE lots ADD CONSTRAINT lots_status_check CHECK (status IN ('for_sale', 'collection', 'sold'));

COMMENT ON COLUMN lots.quantity IS 'Number of identical physical copies of this lot. Selling one splits a sold clone off the row.';
