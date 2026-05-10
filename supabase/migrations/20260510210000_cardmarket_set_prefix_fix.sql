-- Re-derive cardmarket_expansions.set_prefix from url_path with a regex that
-- handles BOTH uppercase (Latin sets like BRS, LOR, BKR) AND mixed-case (JP
-- sets like sv2a, s12a, sm8b). The previous migration's `[A-Z]+` was case-
-- sensitive so it left every JP set with set_prefix=NULL.
--
-- This migration:
--   1. Resets set_prefix on EVERY row (the prior derivation was unreliable —
--      `distinct on` without `order by` picks an arbitrary row, so even some
--      Latin sets ended up with truncated prefixes when the slug happened to
--      have an unusual format).
--   2. Picks the MOST COMMON prefix per expansion (majority vote) to be
--      robust against slug oddities. Ties broken by shortest prefix.
--   3. Strips trailing TG/GG subseries suffix to recover the parent set
--      prefix (LOR Trainer Gallery cards have URL slugs like "-LORTG03"
--      but their S3 image URL uses just "LOR").
--
-- After running, expansions whose URLs simply don't follow the dash+prefix+
-- digits convention (very old promos, CN sets) will still be NULL — handle
-- those with the companion script `scripts/fix-cardmarket-set-prefix.ts`
-- which fetches one product page per expansion to read the img src directly.

-- Step 1: reset.
update cardmarket_expansions set set_prefix = null;

-- Step 2: re-derive via majority vote.
with derived_per_card as (
  select
    id_expansion,
    -- Capture letters at end of slug (case-insensitive); strip TG/GG suffix.
    regexp_replace(
      (regexp_match(url_path, '-([A-Za-z]+)\d+$'))[1],
      '(TG|GG)$',
      '',
      'i'
    ) as prefix
  from cardmarket_card_index
  where url_path is not null
    and url_path ~ '-[A-Za-z]+\d+$'
),
counted as (
  select id_expansion, prefix, count(*) as cnt
  from derived_per_card
  where prefix is not null and prefix <> ''
  group by id_expansion, prefix
),
chosen as (
  -- Most common prefix per expansion. Ties → shortest (more likely to be
  -- the parent set vs a subseries variant we missed).
  select distinct on (id_expansion)
    id_expansion,
    prefix
  from counted
  order by id_expansion, cnt desc, length(prefix) asc
)
update cardmarket_expansions e
set set_prefix = chosen.prefix
from chosen
where e.id_expansion = chosen.id_expansion;

-- Step 3: report.
do $$
declare
  total int;
  with_prefix int;
  null_prefix int;
begin
  select count(*) into total from cardmarket_expansions;
  select count(*) into with_prefix from cardmarket_expansions where set_prefix is not null;
  null_prefix := total - with_prefix;
  raise notice 'cardmarket_expansions.set_prefix backfill: % populated, % NULL out of % expansions',
    with_prefix, null_prefix, total;
end $$;
