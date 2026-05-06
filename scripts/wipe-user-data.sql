-- =============================================================================
-- WIPE USER DATA — one-shot script for resetting before real data import
-- Created: 2026-05-07
-- =============================================================================
--
-- WARNING: This is destructive and irreversible.
-- Run only when you want to start fresh with real Vinted/Pokédex data.
--
-- WHAT THIS DOES:
--   • TRUNCATE cards (and cascade delete card_listings)
--   • TRUNCATE lots (and cascade delete lot_listings)
--
-- WHAT THIS PRESERVES (untouched):
--   • tcg_catalog       (~52K rows scraping LimitlessTCG, expensive to rebuild)
--   • rarity_ranks      (reference data)
--   • user_profiles     (Lui = Hisshiden / Elle = Hilyna identity rows)
--   • config            (app config)
--   • auth.users        (Supabase auth — keep accounts logged in)
--
-- HOW TO RUN:
--   1. Open Supabase Studio → SQL Editor
--   2. Paste the entire content of this file
--   3. Read carefully (especially the SELECT counts at the end)
--   4. Click "Run"
--   5. THEN go to Storage and manually empty the 2 buckets:
--        - card-photos  → select all → delete
--        - lot-photos   → select all → delete
--      (See instructions at the bottom of this file)
--
-- =============================================================================

-- Optional: see what you're about to delete BEFORE running TRUNCATE.
-- Uncomment these lines and run them first if you want a preview.
--
-- select 'cards' as table, count(*) from cards
-- union all select 'lots', count(*) from lots
-- union all select 'card_listings', count(*) from card_listings
-- union all select 'lot_listings', count(*) from lot_listings;

-- ----------------------------------------------------------------------------
-- The actual wipe — single statement, atomic.
-- CASCADE handles card_listings + lot_listings (FK on delete cascade).
-- RESTART IDENTITY resets any sequences (none currently, but future-proof).
-- ----------------------------------------------------------------------------

begin;

truncate table
  cards,
  lots,
  card_listings,
  lot_listings
restart identity cascade;

-- Sanity check: confirm everything is empty.
do $$
declare
  c_cards int;
  c_lots int;
  c_cl int;
  c_ll int;
begin
  select count(*) into c_cards from cards;
  select count(*) into c_lots from lots;
  select count(*) into c_cl from card_listings;
  select count(*) into c_ll from lot_listings;

  if c_cards <> 0 or c_lots <> 0 or c_cl <> 0 or c_ll <> 0 then
    raise exception 'Wipe verification failed: cards=%, lots=%, card_listings=%, lot_listings=%',
      c_cards, c_lots, c_cl, c_ll;
  end if;

  raise notice 'Wipe successful — all 4 user-data tables are empty.';
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Verify what was preserved (should still have data).
-- ----------------------------------------------------------------------------

select 'tcg_catalog'    as table, count(*) as rows from tcg_catalog
union all select 'rarity_ranks',  count(*) from rarity_ranks
union all select 'user_profiles', count(*) from user_profiles
union all select 'config',        count(*) from config;

-- =============================================================================
-- AFTER running this SQL: empty the Storage buckets manually
-- =============================================================================
--
-- Supabase Studio → Storage:
--
--   1. Click bucket "card-photos"
--      → click checkbox in header to select all files
--      → click "Delete" → confirm
--
--   2. Click bucket "lot-photos"
--      → same procedure
--
-- If buckets contain hundreds of files, you may need to scroll/select page
-- by page. Alternatively, use the Supabase CLI:
--
--   supabase storage rm ss://card-photos --recursive
--   supabase storage rm ss://lot-photos  --recursive
--
-- =============================================================================
