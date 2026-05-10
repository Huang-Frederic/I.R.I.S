-- Multilingual name columns for the scanner enrich overhaul.
--
-- Cards table: store the OCR-raw versions alongside the canonical FR/EN forms,
-- so the display layer can render "Canonical (OCR)" when they differ.
ALTER TABLE cards
  ADD COLUMN pokemon_name_ocr text,
  ADD COLUMN card_name_ocr text,
  ADD COLUMN set_name_ja text;

-- Cardmarket expansions: store English and Japanese display names alongside
-- the existing French name. Populated once via scripts/scrape-cardmarket-expansion-names.ts.
ALTER TABLE cardmarket_expansions
  ADD COLUMN name_en text,
  ADD COLUMN name_ja text;

-- Indexes for the constrained-OCR lookup path (validate set name match).
CREATE INDEX cardmarket_expansions_name_en_idx ON cardmarket_expansions (name_en);
CREATE INDEX cardmarket_expansions_name_ja_idx ON cardmarket_expansions (name_ja);
