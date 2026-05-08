-- Backs the daily Vercel cron at /api/prices/update which pulls the 200
-- oldest for_sale cards (cm_updated_at ASC NULLS FIRST). Partial index —
-- the cron never reads cards in any other status, so the index stays small.

create index if not exists idx_cards_for_sale_cm_updated_at
  on cards (cm_updated_at asc nulls first)
  where status = 'for_sale';
