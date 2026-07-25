-- ptcg_cards — allow authenticated writes.
--
-- The initial migration gave this table the shared-reference pattern used by
-- tcg_catalog, cardmarket_* and store_events: authenticated reads, service-role
-- writes. That was the wrong model. Those tables are filled by crons; this one
-- is filled by the user uploading a game file, so the import route writes it
-- with the caller's session and RLS rejected every insert.
--
-- Writing it with the service role instead would work, but service.ts reserves
-- that client for scripts and CRON_SECRET-authorised routes — a user-triggered
-- request is neither. Widening the policy keeps the RLS model honest and avoids
-- needing the service key on a request path.
--
-- The rows are gameplay reference data (name, HP, attacks, image) shared across
-- both users, and every bundle is validated before it reaches this table.

CREATE POLICY "authenticated insert"
  ON ptcg_cards FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated update"
  ON ptcg_cards FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
