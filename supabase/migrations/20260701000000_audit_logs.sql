CREATE TABLE audit_logs (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    timestamptz DEFAULT now() NOT NULL,
  actor_type    text        NOT NULL CHECK (actor_type IN ('user', 'agent', 'system')),
  actor_user_id uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  action        text        NOT NULL,
  entity_type   text,
  entity_id     text,
  details       jsonb       DEFAULT '{}'
);

CREATE INDEX idx_audit_logs_created_at    ON audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_actor_user_id ON audit_logs (actor_user_id);
CREATE INDEX idx_audit_logs_action        ON audit_logs (action);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read"
  ON audit_logs FOR SELECT TO authenticated USING (true);
