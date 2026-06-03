-- Add Vinted posting columns to cards
ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS vinted_listing_id  text,
  ADD COLUMN IF NOT EXISTS vinted_posted_at   timestamptz,
  ADD COLUMN IF NOT EXISTS vinted_post_error  text;

-- Job queue table
CREATE TABLE IF NOT EXISTS vinted_post_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id      uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'processing', 'done', 'error')),
  error        text,
  created_at   timestamptz DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE vinted_post_jobs ENABLE ROW LEVEL SECURITY;

-- Only the card owner can create/read jobs (cards are linked to users via card_listings)
CREATE POLICY "own jobs" ON vinted_post_jobs
  USING (
    card_id IN (
      SELECT card_id FROM card_listings WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    card_id IN (
      SELECT card_id FROM card_listings WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_vinted_post_jobs_card_id ON vinted_post_jobs(card_id);

-- Enable Realtime on the jobs table so the Python agent gets instant push
ALTER PUBLICATION supabase_realtime ADD TABLE vinted_post_jobs;
