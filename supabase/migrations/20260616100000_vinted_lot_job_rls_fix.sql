-- Fix RLS for vinted_post_jobs lot path.
--
-- The previous policy required lot_id IN (SELECT lot_id FROM lot_listings WHERE user_id = auth.uid()),
-- but lot_listings only gets a row AFTER the Vinted agent successfully posts — so first-time
-- lot postings were always blocked.
--
-- For lot jobs, ownership is proven by user_id = auth.uid() on the job itself plus the
-- app-level VINTED_USER_IDS allow-list. The lot_listing existence check is a chicken-and-egg
-- problem and is removed for lot jobs.

DROP POLICY IF EXISTS "Users can manage their own post jobs" ON vinted_post_jobs;

CREATE POLICY "Users can manage their own post jobs"
  ON vinted_post_jobs
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (
      (card_id IS NOT NULL AND card_id IN (SELECT card_id FROM card_listings WHERE user_id = auth.uid()))
      OR lot_id IS NOT NULL
    )
  );
