-- Add Vinted tracking columns to lot_listings (mirrors card_listings).
ALTER TABLE lot_listings
  ADD COLUMN IF NOT EXISTS vinted_listing_id text,
  ADD COLUMN IF NOT EXISTS vinted_posted_at  timestamptz;

-- Allow vinted_post_jobs to target lots as well as cards.
-- card_id becomes nullable; lot_id is new.
-- Exactly one of the two must be non-null (enforced by the check below).
ALTER TABLE vinted_post_jobs
  ALTER COLUMN card_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS lot_id uuid REFERENCES lots(id) ON DELETE CASCADE;

ALTER TABLE vinted_post_jobs
  DROP CONSTRAINT IF EXISTS vinted_post_jobs_one_target;

ALTER TABLE vinted_post_jobs
  ADD CONSTRAINT vinted_post_jobs_one_target
  CHECK (num_nonnulls(card_id, lot_id) = 1);

CREATE INDEX IF NOT EXISTS idx_vinted_post_jobs_lot_id
  ON vinted_post_jobs(lot_id) WHERE lot_id IS NOT NULL;

-- Update RLS: allow lot owners to manage their own lot jobs.
-- The original policy is named "own jobs" (created in 20260603000000_vinted_posting.sql).
-- Drop it and recreate with lot_id support.
-- Note: when card_id IS NULL (lot job), card_id IN (...) evaluates to NULL, not FALSE.
-- The OR short-circuits correctly because CHECK guarantees exactly one non-null.
DROP POLICY IF EXISTS "own jobs" ON vinted_post_jobs;
DROP POLICY IF EXISTS "Users can manage their own post jobs" ON vinted_post_jobs;

CREATE POLICY "Users can manage their own post jobs"
  ON vinted_post_jobs
  FOR ALL
  USING (
    user_id = auth.uid()
    AND (
      card_id IN (SELECT card_id FROM card_listings WHERE user_id = auth.uid())
      OR lot_id IN (SELECT lot_id FROM lot_listings WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND (
      card_id IN (SELECT card_id FROM card_listings WHERE user_id = auth.uid())
      OR lot_id IN (SELECT lot_id FROM lot_listings WHERE user_id = auth.uid())
    )
  );
