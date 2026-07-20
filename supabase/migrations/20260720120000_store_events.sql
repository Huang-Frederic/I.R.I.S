-- store_events — Pokémon events aggregated from local shops (see
-- scripts/store-events/). One row per event; the cron replaces each source's
-- rows on every successful run. Shared reference data (not per-user): any
-- authenticated user reads, only the service-role cron writes.

CREATE TABLE store_events (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  source      text        NOT NULL,             -- extractor id (shop key)
  shop_name   text        NOT NULL,
  city        text        NOT NULL,
  title       text        NOT NULL,
  event_type  text        CHECK (event_type IN ('league','tournament','prerelease','league_cup','league_challenge')),
  starts_at   timestamptz,                      -- NULL when the date couldn't be parsed
  url         text        NOT NULL,
  price       numeric(10,2),
  external_id text        NOT NULL UNIQUE,       -- `${source}:${nativeId}` — upsert dedup key
  scraped_at  timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_store_events_starts_at ON store_events (starts_at);
CREATE INDEX idx_store_events_source    ON store_events (source);

ALTER TABLE store_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read"
  ON store_events FOR SELECT TO authenticated USING (true);
