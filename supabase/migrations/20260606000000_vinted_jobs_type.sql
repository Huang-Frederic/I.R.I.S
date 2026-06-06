ALTER TABLE vinted_post_jobs
  ADD COLUMN IF NOT EXISTS job_type text NOT NULL DEFAULT 'post'
  CHECK (job_type IN ('post', 'repost'));
