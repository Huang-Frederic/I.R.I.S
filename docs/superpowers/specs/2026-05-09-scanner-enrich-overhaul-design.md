# Scanner Enrich Pipeline Overhaul

**Date:** 2026-05-09
**Status:** Draft
**Scope:** Scanner OCR + Enrich + Display + small UI quick fix (Phase 1.x)

## Goal

Refactor the scanner enrich pipeline to (a) use the freshly populated `cardmarket_card_index` as the primary source of truth (decoupling from TCGdex live calls for the 90%+ common case), (b) make set names canonical EN with optional JA suffix for Japanese cards, (c) make Pokémon/card names canonical FR with the raw OCR text in parentheses when divergent, (d) constrain the Gemini OCR prompt against the official 741-expansion list to reduce hallucinations, (e) display the matched card image as a bottom-right thumbnail for instant visual confirmation, and (f) fix a quick batch-thumbnail aspect-ratio bug.

## Motivation

The previous enrich pipeline relied entirely on TCGdex live API calls (5 strategies) followed by a Gemini-only fallback. This had several real problems:

- **Slow & unreliable for the common case**: a card whose `(set_id, set_number)` was already known to Cardmarket required 1-3 TCGdex round-trips even though the answer is sitting in our local Supabase.
- **`cardmarket_id` rarely populated**: the scrape we just ran via BrightData fills `cardmarket_card_index` with 67k mappings — but nothing in the enrich path actually queries this table for the in-app scanner. Result observed in the cards table: 2-50% coverage of `cardmarket_id` depending on language.
- **Set names inconsistent**: TCGdex returns the set name in the requested locale, leading to mixed FR/EN/JA names in `cards.set_name`. The user prefers EN as the universal Pokémon TCG community standard.
- **Pokémon names ambiguous for non-FR cards**: scanning a JP card stores the JA name as `pokemon_name`, which doesn't match the user's French DB (`POKEMON_NAMES`) for display in the FR-targeted UI.
- **OCR hallucinations**: Gemini occasionally outputs set names that don't exist (typos, partial names, made-up sets) because nothing constrains its output against the canonical Cardmarket expansion list.
- **No visual match confirmation**: after OCR, the user sees the form pre-filled but no quick visual cue that the matched card image actually corresponds to their scan.
- **Batch thumbnail bug**: `BatchForm.PhotoDropzone` thumbnails use `h-20 w-full` (~80px × column-width) which crops the user's 3:4 portrait photos into horizontal slivers via `object-cover`.

## Design

### Storage model — multilingual fields

Two-column pattern for fields that have a canonical form distinct from the raw OCR text:

| Column | Source | Notes |
|---|---|---|
| `cards.pokemon_name` | FR canonical, from `POKEMON_NAMES[pokemon_number]` (existing data) | Already FR for matching cards |
| `cards.pokemon_name_ocr` (NEW) | Gemini OCR `pokemon_name` field, raw | What's actually printed |
| `cards.card_name` | FR canonical, from Cardmarket FR product name (parsed) | The scrape gives us this |
| `cards.card_name_ocr` (NEW) | Gemini OCR `card_name` field, raw | |
| `cards.set_name` | EN canonical, from `cardmarket_expansions.name_en` | Universal community name |
| `cards.set_name_ja` (NEW, nullable) | JA from `cardmarket_expansions.name_ja`, only populated for JP cards | |

**Display layer (frontend helpers):**

```ts
function displayPokemonName(card) {
  if (!card.pokemon_name_ocr) return card.pokemon_name;
  if (normalize(card.pokemon_name) === normalize(card.pokemon_name_ocr)) return card.pokemon_name;
  return `${card.pokemon_name} (${card.pokemon_name_ocr})`;
}

function displayCardName(card) {
  if (!card.card_name_ocr) return card.card_name;
  if (normalize(card.card_name) === normalize(card.card_name_ocr)) return card.card_name;
  return `${card.card_name} (${card.card_name_ocr})`;
}

function displaySetName(card) {
  if (card.language === 'JP' && card.set_name_ja) {
    return `${card.set_name} (${card.set_name_ja})`;
  }
  return card.set_name;
}
```

`normalize()` lowercases + strips diacritics + collapses whitespace, so trivial diffs (case, accent encoding) don't trigger the parenthesis form.

### `cardmarket_expansions` extension — multilingual names

New columns: `name_en`, `name_ja` (both nullable). Pre-populated **once** by re-scraping the CM expansion dropdown from `/en/Pokemon` and `/ja/Pokemon` (1 BrightData request each, ~$0.003 total). Each dropdown returns the same 741 idExpansion entries, just with different language labels. We zip them by idExpansion.

A new local script `scripts/scrape-cardmarket-expansion-names.ts` does this in <1 minute, no Apify Actor needed (single page each, simple curl through BrightData). Idempotent — can re-run if names change.

### Pipeline overhaul — Strategy 0 lookup

Insert as the FIRST strategy in [app/api/enrich/route.ts](app/api/enrich/route.ts):

```
Strategy 0 (NEW): cardmarket_card_index direct lookup
  Inputs:
    - id_expansion  (resolved from OCR set_name via cardmarket_expansions match)
    - set_number    (from OCR, normalized)
    - language      (from OCR)
  Lookup:
    SELECT ci.id_product, ci.url_path, cp.name AS cm_name
    FROM cardmarket_card_index ci
    JOIN cardmarket_products cp ON cp.id_product = ci.id_product
    WHERE ci.id_expansion = ? AND ci.set_number = ? AND ci.language = ?
  Build EnrichedCard with:
    - cardmarket_id   = id_product
    - cardmarket_url  = url_path
    - tcg_image_url   = constructed from S3 pattern: https://product-images.s3.cardmarket.com/51/{set}/{id}/{id}.jpg
    - card_name       = parsed FR name from cm_name (drops the [...] move-list bracket)
    - set_name        = cardmarket_expansions.name_en
    - set_name_ja     = cardmarket_expansions.name_ja (only populated if language='JP')
  Returns: BestMatch { source: 'cardmarket-index', confidence: 0.95 }

Strategy 1-5 (unchanged): TCGdex chain — kept as fallback for fields Strategy 0 cannot supply (rarity, dexId, illustrator) AND for cards NOT in cardmarket_card_index yet.

Strategy 6 (unchanged): Gemini-only fallback for exotic KO/CN cards.
```

When Strategy 0 hits but TCGdex Strategy 1-5 also hit, we MERGE the results: cardmarket data takes precedence for `cardmarket_id`, `cardmarket_url`, `card_name`, `set_name`; TCGdex fills `rarity`, `pokemon_number`, `illustrator`.

### Constrained OCR prompt

Modify [lib/api/gemini-vision.ts](lib/api/gemini-vision.ts) system prompt to include the 741-expansion list. The prompt addition:

```
CONTRAINTE IMPORTANTE — Le champ `set_name` DOIT correspondre exactement à un des
noms suivants (copie verbatim, en respectant accents et casse). Si tu ne peux
pas identifier le set avec une confiance > 80%, retourne null pour ce champ
plutôt qu'inventer ou approximer.

Liste exhaustive des sets Pokémon TCG existants (741 entrées):
- Brilliant Stars
- Stellar Crown
- Étoiles Étincelantes
- ... (toutes les FR + EN + JA names depuis cardmarket_expansions)
```

The list is built dynamically at server startup from `cardmarket_expansions.{name, name_en, name_ja}` (with deduplication). All three locale forms accepted to give Gemini flexibility — we map back to the canonical EN at storage time.

Same approach for `rarity`: append a controlled vocabulary list (C, U, R, RR, AR, SAR, etc.) and tell Gemini to pick from the list or return null.

Token cost: ~10-20k input tokens per OCR call. At Gemini Flash ~$0.075/M input tokens = +$0.001 per call. Negligible.

### Card match preview component

New component `components/scanner/CardMatchPreview.tsx`:

```tsx
interface Props {
  imageUrl: string | null;
  className?: string;
}

export default function CardMatchPreview({ imageUrl, className }: Props) {
  if (!imageUrl) return null;
  return (
    <div className={`bg-white/10 backdrop-blur-sm rounded-lg p-1 shadow-md ${className ?? ''}`}>
      <img
        src={imageUrl}
        alt="Carte matchée par l'API"
        className="aspect-[5/7] w-16 object-contain rounded"
      />
    </div>
  );
}
```

Mounted in [components/submit/CardScanForm.tsx](components/submit/CardScanForm.tsx) in the same wrapper as `PokemonSpriteBadge` and `MagnifierLoupe`:

```tsx
<div className="relative">
  <MagnifierLoupe ... />
  <PokemonSpriteBadge ... className="absolute top-2 right-2 z-10" />
  <CardMatchPreview imageUrl={form.tcg_image_url} className="absolute bottom-2 right-2 z-10" />
</div>
```

Behavior:
- Hidden when `form.tcg_image_url` is null (no match yet, or match failed)
- Shown immediately after Strategy 0/1-5 returns a `tcg_image_url`
- ~64px wide, card aspect ratio 5:7
- Subtle backdrop blur + shadow to read on any photo background

### Quick fix — batch thumbnail aspect

In [components/submit/BatchForm.tsx](components/submit/BatchForm.tsx) line 234, change:

```diff
-              <img src={URL.createObjectURL(p)} alt="" className="h-20 w-full rounded object-cover" />
+              <img src={URL.createObjectURL(p)} alt="" className="aspect-[3/4] w-full rounded object-cover" />
```

This makes the thumbnail respect the photo's portrait aspect (Samsung default 3:4) instead of forcing it into a horizontal 80px slice.

## Architecture

```
app/api/enrich/route.ts           ← modified (Strategy 0 added at top)
lib/api/cardmarket-enrich.ts      ← NEW (Strategy 0 implementation)
lib/api/gemini-vision.ts          ← modified (constrained prompt with expansion list)
lib/utils/format-name.ts          ← NEW (display helpers: displayPokemonName, displayCardName, displaySetName)

components/scanner/CardMatchPreview.tsx   ← NEW
components/submit/CardScanForm.tsx        ← modified (mount CardMatchPreview)
components/submit/BatchForm.tsx           ← modified (1-line aspect-[3/4] fix)

scripts/scrape-cardmarket-expansion-names.ts   ← NEW one-shot to populate name_en/name_ja

supabase/migrations/
└── 20260510000000_multilang_names.sql  ← NEW migration:
      - cards: ADD pokemon_name_ocr, card_name_ocr, set_name_ja
      - cardmarket_expansions: ADD name_en, name_ja
```

## Storage migration details

```sql
-- 20260510000000_multilang_names.sql

ALTER TABLE cards
  ADD COLUMN pokemon_name_ocr text,
  ADD COLUMN card_name_ocr text,
  ADD COLUMN set_name_ja text;

ALTER TABLE cardmarket_expansions
  ADD COLUMN name_en text,
  ADD COLUMN name_ja text;

-- Index for fast OCR-constrained set lookups in the enrich strategy 0
CREATE INDEX cardmarket_expansions_name_en_idx ON cardmarket_expansions (name_en);
CREATE INDEX cardmarket_expansions_name_ja_idx ON cardmarket_expansions (name_ja);
```

No backfill in migration: existing rows keep `set_name` (FR), the 191 user cards get refreshed via the planned post-scrape re-enrich script.

## Display impact

| UI surface | Before | After |
|---|---|---|
| Card list (Vinted, Stock, Pokédex) | "Dracaufeu ex" (FR) or "Charizard ex" (EN if scanned EN) | Always "Dracaufeu ex", with "Dracaufeu ex (Charizard ex)" if OCR was different |
| Card detail set name | "Évolution Prismatique" (FR catalog) | "Prismatic Evolution"; for JP: "Prismatic Evolution (黒煙の覇者)" |
| Scanner photo zone | Photo + Pokémon sprite (top-right) | Photo + sprite (top-right) + matched card thumbnail (bottom-right) |
| BatchForm photo grid | 80px-tall horizontal slivers | 3:4 portrait thumbnails matching the photo's natural ratio |

## Hors-scope (YAGNI)

- No re-scraping of `cardmarket_card_index` per-language (FR already done; EN/JA scrapes can be added later if needed for non-FR community)
- No replacement of the daily Cardmarket pricing dump cron (continues to populate `cards.cm_price_*` based on `cardmarket_id`)
- No removal of TCGdex from `lib/api/tcgdex.ts` — kept for fallback on non-Cardmarket-indexed cards (rarity/illustrator)
- No automatic re-enrich of the 191 existing cards in this spec — separate post-scrape script (mentioned in roadmap, separate task)
- No Gemini response_schema with native enum (string-list-in-prompt approach is sufficient for v1; can upgrade if drift persists)
- No click-to-zoom on `CardMatchPreview` (just static thumbnail)
- No `displaySetName` localization toggle (always EN unless JP)

## Testing

**Unit tests (vitest):**
- `lib/utils/format-name.test.ts`: `displayPokemonName`, `displayCardName`, `displaySetName` cover the canonical-equals-OCR case, the divergent case, the JP set case, and the null OCR case.
- `lib/api/cardmarket-enrich.test.ts`: mock Supabase client, verify Strategy 0 returns the expected EnrichedCard shape for a known fixture, returns null for missing rows.

**Integration test (manual):**
1. Scan a FR card → verify `pokemon_name == card.pokemon_name`, `pokemon_name_ocr == OCR`, display shows just FR.
2. Scan an EN card → display shows "FR (EN)" if pokemon_name differs.
3. Scan a JP card → display shows "FR (JA)" + set shows "EN (JA)".
4. Scan a card not in cardmarket_card_index → falls back to TCGdex, still works.
5. Verify `CardMatchPreview` appears bottom-right when match found, hidden otherwise.
6. Verify BatchForm thumbnails are now portrait 3:4 instead of horizontal slivers.

**No test for the constrained OCR prompt itself** (it's a Gemini prompt change, validated via manual scans).

## Risks

1. **Pre-populating `cardmarket_expansions.name_en/name_ja` requires correct dropdown scrape**: If the EN/JA dropdown structure differs from the FR one we already scraped, the script needs adapting. Mitigation: smoke test on the dropdown HTML first, validate count = 741.
2. **Strategy 0 false positives**: If OCR set_name resolves to wrong idExpansion (e.g., similar names across languages), Strategy 0 may return the wrong card. Mitigation: constrained OCR (#3) reduces drift; if still observed, add a secondary check on the resulting card name vs OCR card_name.
3. **Token cost of 741-name list in OCR prompt**: ~$0.001 per call. Negligible. If users scan 1000 cards/day, that's $1/day extra. Acceptable.
4. **Migration backward compat**: new columns are nullable, existing code that reads `set_name` continues to work (it just won't get the EN name until cards are re-enriched). The 191 existing cards keep their FR set_name until the planned re-enrich.
5. **JP cards with no JA name in `cardmarket_expansions.name_ja`**: not all 741 expansions have a Japanese release (most are EN-only sets). Display falls back to EN-only when `set_name_ja` is null. No bug.
