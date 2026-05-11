-- Add Pokédex tracking to the daily portfolio snapshot.
--
-- Previously the snapshot covered for_sale + collection only — Pokédex cards
-- were treated as non-monetary. The dashboard now surfaces the Pokédex value
-- next to its counter, and the cron upsert was failing with PGRST204
-- ("count_pokedex" column missing in schema cache) because the TypeScript
-- result already included those fields. This aligns the schema with the code.

alter table stock_value_snapshots
  add column if not exists value_pokedex numeric(12, 2) not null default 0,
  add column if not exists count_pokedex int not null default 0;
