-- Add is_lot flag and brand_label to lots.
-- is_lot is derived from catalog_id for existing rows so Singles (4875) stay singles.
-- brand_label stores the display label (e.g. "Riftbound") independently of brand_id.

ALTER TABLE lots
  ADD COLUMN IF NOT EXISTS is_lot      boolean,
  ADD COLUMN IF NOT EXISTS brand_label text;

-- Populate is_lot from existing catalog_id:
--   catalog_id NULL or 4879 (CARD_LOTS_CATALOG_ID) → lot (true)
--   catalog_id 4875 (CARDS_CATALOG_ID)             → single (false)
UPDATE lots SET is_lot = (catalog_id IS NULL OR catalog_id = 4879);

ALTER TABLE lots ALTER COLUMN is_lot SET NOT NULL;
ALTER TABLE lots ALTER COLUMN is_lot SET DEFAULT true;
