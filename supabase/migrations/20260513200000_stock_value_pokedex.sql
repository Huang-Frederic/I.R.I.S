-- Extend stock_value_snapshots with pokedex value/count so the
-- PortfolioValueChart can include pokedex (reference) cards as a toggle.
-- Defaults to 0 so existing rows stay valid.
-- Spec: docs/superpowers/specs/2026-05-13-price-history-design.md
--
-- NOTE: these two columns were already added in
-- 20260511000000_pokedex_snapshot_columns.sql (which fixed a PGRST204
-- cron failure when the TS result already carried pokedex aggregates).
-- This migration is intentionally idempotent (`if not exists`) so it
-- no-ops on environments that already have the columns, and serves as
-- the audit-trail entry for the price-history design spec.

alter table stock_value_snapshots
  add column if not exists value_pokedex numeric(12, 2) not null default 0,
  add column if not exists count_pokedex int not null default 0;
