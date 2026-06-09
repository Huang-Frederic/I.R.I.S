-- Move Vinted listing data from cards (global) to card_listings (per-user).
-- Each user now has their own vinted_listing_id / vinted_posted_at on their
-- card_listings row, enabling independent posting to separate Vinted accounts.

ALTER TABLE card_listings
  ADD COLUMN IF NOT EXISTS vinted_listing_id text,
  ADD COLUMN IF NOT EXISTS vinted_posted_at  timestamptz;

-- Migrate existing data for cards that already have a card_listings entry
UPDATE card_listings cl
SET vinted_listing_id = c.vinted_listing_id,
    vinted_posted_at  = c.vinted_posted_at
FROM cards c
WHERE cl.card_id = c.id
  AND c.vinted_listing_id IS NOT NULL;

-- Drop the now-global columns from cards.
-- vinted_post_error is also dropped — it was never surfaced in the UI and
-- errors are already tracked in vinted_post_jobs.error.
ALTER TABLE cards
  DROP COLUMN IF EXISTS vinted_listing_id,
  DROP COLUMN IF EXISTS vinted_posted_at,
  DROP COLUMN IF EXISTS vinted_post_error;
