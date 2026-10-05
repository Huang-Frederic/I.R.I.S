-- supabase/migrations/20261005120000_other_items_vinted_attributes.sql
-- Two fixes to what other_items stores about a listing's Vinted attributes.
--
-- 1. vinted_condition_id held a 1-5 scale (1 = neuf avec étiquette ...
--    5 = satisfaisant) on the assumption that Vinted's ids follow that label
--    order. They don't — probed on POST /api/v2/item_upload/attributes:
--    6 = neuf avec étiquette, 1 = neuf sans étiquette, 2 = très bon état,
--    3 = bon état, 4 = satisfaisant, plus category-specific extras (7 =
--    "certaines pièces ne fonctionnent pas" on appliances; perfume only
--    accepts 6). The bot sent the stored value as-is, so every item would
--    have been listed one grade below what its description said, and 5 is
--    not a valid id at all. Remap onto Vinted's real ids and replace the
--    1-5 check with a plain positivity check, since the valid set depends on
--    the category (see vinted_catalog_attributes).
--
-- 2. Clothing and shoe categories require a size and a color, which were
--    never stored nor sent ("Le champ Taille doit être renseigné"). Size is
--    one of the category's size option ids; `size` stays as its
--    human-readable label for the description. Vinted accepts up to 2 colors.

-- The check's auto-generated name isn't guaranteed, so find it by definition
-- (same pattern as 20261002120200_vinted_queue_jobs_other_items.sql).
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'other_items'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%vinted_condition_id%'
  loop
    execute format('alter table other_items drop constraint %I', c.conname);
  end loop;
end $$;

update other_items set vinted_condition_id = case vinted_condition_id
  when 1 then 6
  when 2 then 1
  when 3 then 2
  when 4 then 3
  when 5 then 4
  else vinted_condition_id
end;

alter table other_items
  add constraint other_items_vinted_condition_id_check check (vinted_condition_id > 0);

alter table other_items add column vinted_size_id integer;
alter table other_items
  add column vinted_color_ids smallint[] not null default '{}'
  constraint other_items_vinted_color_ids_max_two check (cardinality(vinted_color_ids) <= 2);
