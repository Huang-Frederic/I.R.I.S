-- supabase/migrations/20261006120000_other_items_package_size.sql
-- The parcel format to post an other_item with, when Fred picks one.
-- Formats depend on the category: clothes offer Petit/Moyen/Grand (1/2/3),
-- vacuums only 5-30 kg bulky formats (11-14) — the bot used to send Petit for
-- everything and Vinted refused the vacuum ("Sélectionne le format de ton
-- colis"). The bot uses this column first, then Petit where the category
-- offers it, then Vinted's own suggestion (vinted-agent/catalog_attributes.py,
-- choose_package_size). Safe to re-run.
alter table other_items add column if not exists vinted_package_size_id integer;
