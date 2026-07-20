-- Trade system: cards can leave the collection via an exchange (not a sale).
--
-- New enum value 'traded' on card_status + three columns on cards:
--   traded_at          when the exchange happened (user-picked date)
--   traded_by_user_id  who recorded the trade (mirror of sold_by_user_id)
--   trade_photo_url    optional photo of the whole trade batch — the same URL
--                      is stamped on every card of the batch (flat model, no
--                      trades table: consistent with sold_* living on cards)
--
-- NOTE: ALTER TYPE ... ADD VALUE is safe inside the migration transaction on
-- PG 12+ as long as the new value is not USED in the same transaction — we
-- only add columns here, no rows are written with 'traded'.

ALTER TYPE card_status ADD VALUE IF NOT EXISTS 'traded';

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS traded_at timestamptz,
  ADD COLUMN IF NOT EXISTS traded_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS trade_photo_url text;

COMMENT ON COLUMN cards.traded_at IS 'When the card left via a trade (status=traded). NULL otherwise.';
COMMENT ON COLUMN cards.trade_photo_url IS 'Photo of the trade batch (card-photos bucket, trades/ prefix). Shared by all cards of one bulk trade.';
