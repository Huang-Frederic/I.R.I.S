-- Adds the cardmarket S3 image-URL set prefix to cardmarket_expansions.
--
-- The cardmarket image URL pattern is:
--   https://product-images.s3.cardmarket.com/51/{set_prefix}/{id_product}/{id_product}.jpg
--
-- Examples:
--   BREAKpoint        → set_prefix = 'BKR'
--   Lost Origin       → set_prefix = 'LOR'  (also used for LOR Trainer Gallery)
--   Brilliant Stars   → set_prefix = 'BRS'
--
-- Previously the enrich pipeline used cardmarket_products.card_prefix as the
-- URL set_prefix — but card_prefix is the POKEMON NAME (extracted from the
-- product name), not the set abbreviation. URLs were coming out as
-- /51/Pansage/835910/835910.jpg → 403 from S3.
--
-- One value per expansion (cardmarket S3 prefix is constant within a set).

alter table cardmarket_expansions
  add column if not exists set_prefix text;

-- Backfill from cardmarket_card_index.url_path. The slug ends with
--   /{Card-Name-Slug}-{PREFIX}{NUMBER}
-- where PREFIX is the set prefix (or set+TG/GG for subseries), NUMBER is digits.
-- Examples:
--   /Brilliant-Stars/Exeggcute-BRS001     → PREFIX = 'BRS'
--   /Lost-Origin/Charizard-V-V-LORTG03    → PREFIX = 'LORTG' → strip TG → 'LOR'
--   /Lost-Origin/Pikachu-V-LORGG10        → PREFIX = 'LORGG' → strip GG → 'LOR'
--
-- Heuristic: take the longest letter run before trailing digits, then strip
-- a trailing 'TG' or 'GG' subseries suffix to recover the parent prefix.
update cardmarket_expansions e
set set_prefix = derived.prefix
from (
  select distinct on (id_expansion)
    id_expansion,
    -- Strip TG/GG subseries suffix from the captured letters.
    regexp_replace(
      (regexp_match(url_path, '-([A-Z]+)\d+$'))[1],
      '(TG|GG)$',
      ''
    ) as prefix
  from cardmarket_card_index
  where url_path is not null
    and url_path ~ '-[A-Z]+\d+$'
) derived
where e.id_expansion = derived.id_expansion
  and e.set_prefix is null;
