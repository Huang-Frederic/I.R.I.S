-- Add illustrator column to tcg_catalog. Populated by re-scraping LimitlessTCG
-- card-detail pages (one HTTP call per card vs the previous set-only flow).
-- Used by /api/enrich Strategy 2.5 for auto-disambiguation when multiple
-- catalog rows match (pokemon_name + localId + language) — pick the one whose
-- illustrator matches Gemini's extracted illustrator field.

alter table tcg_catalog add column if not exists illustrator text;
create index if not exists tcg_catalog_illustrator_idx on tcg_catalog (illustrator);
