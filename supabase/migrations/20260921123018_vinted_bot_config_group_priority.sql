-- An ordered array of group-name strings (e.g. ["Pokémon FR", "Riftbound",
-- "Magic"]) the user configures once from the Settings modal's group
-- priority editor. A group present in the queue but absent from this list
-- sorts after all listed groups (see lib/vinted/group-sort.ts) — no crash,
-- no mandatory pre-configuration.
alter table vinted_bot_config
  add column group_priority jsonb not null default '[]'::jsonb;
