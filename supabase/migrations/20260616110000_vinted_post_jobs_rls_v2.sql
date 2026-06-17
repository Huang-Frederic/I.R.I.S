-- Fix RLS for vinted_post_jobs — both card and lot paths.
--
-- The previous fix (20260616100000) correctly removed the lot_listings chicken-and-egg
-- check, but kept a card_listings check that has the same problem: a card that has
-- never been posted to Vinted has no card_listings row, so the INSERT was blocked.
--
-- Ownership is already proven by:
--   - user_id = auth.uid() on the job row
--   - RLS on the cards / lots tables (SELECT already filtered by ownership)
--   - App-level VINTED_USER_IDS allow-list
--
-- The listing-existence checks are chicken-and-egg and are removed entirely.

DROP POLICY IF EXISTS "Users can manage their own post jobs" ON vinted_post_jobs;

CREATE POLICY "Users can manage their own post jobs"
  ON vinted_post_jobs
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (card_id IS NOT NULL OR lot_id IS NOT NULL)
  );
