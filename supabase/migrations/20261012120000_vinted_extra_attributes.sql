-- supabase/migrations/20261012120000_vinted_extra_attributes.sql
-- Some categories ask for more than size, color and condition: Vinted refused
-- a laptop until it had a storage capacity, a RAM capacity and "charger
-- included", and a Steam Deck until it had a platform (2026-10-12).
--
-- vinted_catalog_attributes.extra_attributes: every other attribute the
-- category configures, as parsed by the bot (vinted-agent/catalog_attributes.py,
-- _extra_attributes): [{code, title, required, multiple, options: [{id, title}]}].
-- other_items.vinted_extra_attributes: the values picked for them, {code: [ids]}.
--
-- Re-runnable: the columns are added only once, and cached categories are
-- sent back to the bot for a re-read only in the run that adds the column
-- (they were cached without their extra attributes).

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vinted_catalog_attributes' and column_name = 'extra_attributes'
  ) then
    alter table vinted_catalog_attributes add column extra_attributes jsonb not null default '[]'::jsonb;
    -- The bot's _attribute_requests_loop fills 'pending' rows again.
    update vinted_catalog_attributes set status = 'pending' where status = 'ready';
  end if;
end $$;

alter table other_items
  add column if not exists vinted_extra_attributes jsonb not null default '{}'::jsonb;
