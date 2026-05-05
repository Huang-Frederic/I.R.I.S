-- 20260505100000_sold_by_user.sql
--
-- Phase 4 follow-up: track WHICH user marked a card or lot as sold.
-- Used by the Vendus pile in /vinted to show a 'Moi/Lui/Elle' badge
-- so the seller is visible at a glance.
--
-- The cards.status / lots.status PATCH route writes the current user's id
-- when transitioning to status='sold'. NULL for sold items predating this
-- migration — the UI shows '?' or omits the badge in that case.

ALTER TABLE cards
  ADD COLUMN sold_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE lots
  ADD COLUMN sold_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill: any pre-existing sold items get attributed to Hisshiden, who
-- owned the data before the multi-user migration. Safe heuristic since
-- Phase 4 also seeded all card_listings with Hisshiden as owner.
UPDATE cards
SET sold_by_user_id = '35385d3c-5966-4a10-8568-8d92d1be47e7'
WHERE status = 'sold' AND sold_by_user_id IS NULL;

UPDATE lots
SET sold_by_user_id = '35385d3c-5966-4a10-8568-8d92d1be47e7'
WHERE status = 'sold' AND sold_by_user_id IS NULL;
