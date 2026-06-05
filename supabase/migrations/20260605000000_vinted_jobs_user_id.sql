-- Add user_id to vinted_post_jobs so the Python agent can route jobs
-- to the correct Vinted account (each user has their own cookies file).
ALTER TABLE vinted_post_jobs
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
