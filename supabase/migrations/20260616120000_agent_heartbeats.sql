-- Agent heartbeat table: the Python agent upserts last_seen_at every 30s.
-- The frontend polls this table to show an online/offline indicator.

CREATE TABLE IF NOT EXISTS agent_heartbeats (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE agent_heartbeats ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read heartbeats — not sensitive, just a timestamp.
-- This lets the partner user also see the agent status.
CREATE POLICY "Authenticated users can read heartbeats"
  ON agent_heartbeats FOR SELECT
  TO authenticated
  USING (true);

-- The agent runs with the service role key which bypasses RLS for writes.
-- No INSERT/UPDATE policy needed.
