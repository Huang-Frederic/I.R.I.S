# Cardmarket card_index mapping

You're looking at how `cardmarket_card_index` — the `(expansion, set_number) → id_product` map that powers the FAST PATH in [`lib/api/cardmarket-pricing.ts`](../lib/api/cardmarket-pricing.ts) — actually gets populated. The short answer (today): a **BrightData Web Unlocker scrape** of each expansion's Cardmarket gallery page, extracting the real tuples `(id_product, set_number, url_variant, url_path, set_prefix)` straight off the DOM. The long answer is the rest of this file, including the SQL-formula approach that came before, why it wasn't enough, and where it still earns its place as a rapid-prototyping fallback.

For an overview of where this index fits in the pricing pipeline, see [ARCHITECTURE.md](ARCHITECTURE.md#data-flow-pricing-pipeline). For the operator click-path, see [SETUP.md §9](SETUP.md#9--build-the-cardmarket_card_index-brightdata-scraper).

## Table of contents

- [Why this matters](#-why-this-matters)
- [The current path: BrightData scraper](#-the-current-path-brightdata-scraper)
- [Capturing `set_prefix`](#-capturing-set_prefix)
- [The fallback path: SQL formula](#-the-fallback-path-sql-formula)
- [Validation results (formula vs scrape)](#-validation-results-formula-vs-scrape)
- [Wheel-type promos: the edge case](#-wheel-type-promos-the-edge-case)
- [When to re-run](#-when-to-re-run)
- [History: how I got here](#-history-how-i-got-here)

---

## 🎯 Why this matters

Phase 3 (Cardmarket pricing on every for-sale card) needs each card in the local catalogue to be matched to its Cardmarket `id_product` so the daily pricing dump in `cardmarket_pricing` can be joined. The catch: Cardmarket's official S3 dump exposes `id_product`, `name`, `card_prefix`, `id_expansion`, `id_metacard` — but **not** `set_number / collector_number`.

Without `set_number`, joining a card to the right Cardmarket product is a nightmare:

- **Name fuzzy-match** — ambiguous when multiple cards share a name in a set (think "Pikachu" appearing five times with different attacks).
- **Variant disambiguation** (Common vs Reverse Holo vs AR) — impossible from the dump's name field alone.
- **Image URL construction** — `https://product-images.s3.cardmarket.com/{prefix}/{id}/{id}.jpg` requires the per-expansion `set_prefix`, which the dump doesn't expose.

So the index needs to be derived externally. I burned through three approaches before settling on the current one.

---

## 🤖 The current path: BrightData scraper

The scraper at [`scrapers/cardmarket/`](../scrapers/cardmarket/) hits each expansion's Cardmarket gallery page through **BrightData Web Unlocker**, which solves the captcha + bot fingerprinting in front of `cardmarket.com` natively (the proxy sits between you and Cardmarket and serves you a real-looking response). Each card on the page is parsed in [`scrapers/cardmarket/src/scrape.ts`](../scrapers/cardmarket/src/scrape.ts) into a `ScrapedCard` carrying the real `(id_product, set_number, url_variant, url_path, set_prefix)` tuple, and the per-card rows are upserted into `cardmarket_card_index` in [`scrapers/cardmarket/src/supabase.ts`](../scrapers/cardmarket/src/supabase.ts).

**Coverage today:** 529 / 741 expansions (~71 %). The 212 NULL-prefix expansions are mostly very old sets, FR localisations of EN sets (so duplicates), or rare JP promos. Re-scraping is mechanical — see [SETUP.md §9](SETUP.md#9--build-the-cardmarket_card_index-brightdata-scraper) for the click-path or [COMMANDS.md → generate-rescrape-input.ts](COMMANDS.md#generate-rescrape-inputts).

**Cost:** ~$4.50 per full backfill (741 expansions × ~4 pages each at $1.50 / CPM). The BrightData free tier ($5 credit) covers one full pass.

**JP-prefix regex bug, fixed 2026-05-10.** The original parser regex `[A-Z]+\d+$` rejected JP set codes with embedded digits (`sv1a074`, `sv2a169`, `s12a015`) and silently extracted zero cards across the whole SV-JP catalogue. The new regex `[A-Za-z][A-Za-z0-9]*?[A-Za-z]\d+$` handles them ([scrape.ts](../scrapers/cardmarket/src/scrape.ts) + a regression test in [scrape.test.ts](../scrapers/cardmarket/src/scrape.test.ts)).

---

## 🖼 Capturing `set_prefix`

The other thing the scraper extracts — which the dump doesn't carry — is each expansion's S3 image-URL prefix (`BRS`, `LOR`, `sv2a`, `BKR`, `BKP`…). The scraper reads the prefix off the first card image's `<img src>` and majority-votes per expansion (handles a few mis-tagged images per set), then writes it onto `cardmarket_expansions.set_prefix`. That column is load-bearing in two places:

- **Enrich Strategy 0** at [`/api/enrich/route.ts`](../app/api/enrich/route.ts) pivots on it: `set_prefix` (from Gemini OCR) → `id_expansion` (lookup) → `set_number` (from OCR) → `id_product` (cardmarket_card_index).
- **Image proxy** at [`/api/cm-img/[id]?prefix={set_prefix}`](../app/api/cm-img/%5Bid%5D/route.ts) builds the canonical S3 URL `https://product-images.s3.cardmarket.com/{prefix}/{id}/{id}.jpg` and proxies it past CloudFront's hotlink protection.

For the 212 expansions where the BrightData scraper hasn't run, [`scripts/fix-cardmarket-set-prefix.ts`](../scripts/fix-cardmarket-set-prefix.ts) is an HTTP-only fallback that fetches one product page per NULL expansion with browser headers and parses the prefix off the S3 URL in the HTML.

---

## 🧮 The fallback path: SQL formula

Before the BrightData scrape was reliable enough to depend on, I ran a SQL formula against the dump that recovers `set_number` from the dump's own structure. It still works for ~95 % of expansions and is a **valuable rapid-prototyping fallback** — useful when you need an index right now and BrightData isn't set up, or for the historical record. It leaves `url_path = NULL` (so deep-links get synthesised on demand by [`buildSyntheticCardmarketUrlPath`](../lib/api/cardmarket-pricing.ts)) and is wrong on wheel-type promo sets.

### How it works

Three patterns in the dump make the formula possible:

1. **`id_product` is sequential within an expansion.** For `id_expansion = 5636` (Crimson Haze), products are numbered 882917 → 882974 contiguously. Every expansion follows this — products are allocated in one batch when the set is added to Cardmarket's DB.
2. **Variants of the same card cluster in consecutive `id_product` values.** In Gem Pack Vol 5, "Captain Pikachu" occupies 884460–884465 (six consecutive entries — V1 through V6).
3. **`card_prefix` reliably identifies a logical card within a set.** Different cards never collide on `card_prefix` in normal sets; variants of the same card always share it.

Sort by `id_product` within an expansion, group consecutive rows with the same `card_prefix`, and the Nth group is collector_number N. Within each group, products are V1, V2, V3 in `id_product` order.

### The query

Run once in the Supabase SQL editor when you need a no-scrape index:

```sql
INSERT INTO cardmarket_card_index (id_product, id_expansion, set_number, url_variant, language, url_path)
WITH ordered AS (
  SELECT cp.id_expansion, cp.id_product, cp.card_prefix,
    LAG(cp.card_prefix) OVER (PARTITION BY cp.id_expansion ORDER BY cp.id_product) AS prev_prefix
  FROM cardmarket_products cp
  WHERE cp.id_expansion NOT IN (SELECT DISTINCT id_expansion FROM cardmarket_card_index)
),
grouped AS (
  SELECT id_expansion, id_product,
    SUM(CASE WHEN card_prefix IS DISTINCT FROM prev_prefix THEN 1 ELSE 0 END)
      OVER (PARTITION BY id_expansion ORDER BY id_product) AS card_group_idx
  FROM ordered
)
SELECT
  g.id_product,
  g.id_expansion,
  DENSE_RANK() OVER (PARTITION BY g.id_expansion ORDER BY g.card_group_idx)::text,
  CASE
    WHEN COUNT(*) OVER (PARTITION BY g.id_expansion, g.card_group_idx) > 1
    THEN 'V' || ROW_NUMBER() OVER (PARTITION BY g.id_expansion, g.card_group_idx ORDER BY g.id_product)::text
    ELSE NULL
  END,
  'fr',
  NULL
FROM grouped g;
```

Three things to know:

- **The `WHERE id_expansion NOT IN (...)` filter is critical.** Already-mapped expansions (typically the wheel sets covered manually by the scraper) are protected from being overwritten with formula-derived data.
- **`url_path` is set to `NULL`.** The actual Cardmarket URL slug isn't derivable from the dump alone — synthesise it on demand if you need a deep link. The pricing join doesn't need it.
- **The language is hard-coded `'fr'`.** I.R.I.S currently surfaces the FR Cardmarket. If you add other locales later, run the formula again with the appropriate literal.

---

## ✅ Validation results (formula vs scrape)

Tested against five expansions that had been gallery-scraped manually before the formula existed:

| Set | Products | Formula vs ground truth | Verdict |
|---|---|---|---|
| **Crimson Haze** (5636) | 96 | 96/96 ✅ | Standard SV booster — perfect |
| **Gem Pack Vol 5** (6544) | 196 | 196/196 ✅ | Multi-variant Asian set (7 variants/card) — perfect |
| **Golden Energy** (6548) | 54 | 54/54 ✅ | Energy promo — perfect |
| **Battle Party Set** (6549) | 47 | 9/47 ❌ | Wheel-type promo (collector range 0–9) — fails |
| **Void Blast** (6519) | 58 | 0/58 ❌ | Wheel-type promo (collector range 0–9) — fails |

Three of five sets match perfectly — they cover the three shapes that account for ~95 % of Pokémon TCG sets: standard boosters, multi-variant Asian sets, standalone promo sheets. The two failures are wheel-type promo packs (next section).

The BrightData scrape doesn't have these limitations — it reads the real collector_number off the page, so wheel sets are correct out of the box.

---

## 🎡 Wheel-type promos: the edge case

A wheel set is a promo product (Battle Party Set, Void Blast) where Cardmarket assigns collector numbers 0–9 cyclically across many cards. The relationship between `id_product` order and collector_number is non-deterministic in these sets, and the SQL formula produces wrong numbers.

**You can't detect them from the dump alone.** They often look like normal small booster sets (1 product per card, 50 unique names). The reliable signal is the actual collector range on Cardmarket — which you only see by scraping or by comparing formula output to ground truth.

**Heuristic detection after running the formula:**

```sql
SELECT
  ce.name, ci.id_expansion,
  COUNT(*) AS rows,
  MAX(ci.set_number::int) AS max_collector,
  ROUND(COUNT(*)::numeric / NULLIF(MAX(ci.set_number::int), 0), 2) AS ratio
FROM cardmarket_card_index ci
JOIN cardmarket_expansions ce ON ce.id_expansion = ci.id_expansion
GROUP BY ce.name, ci.id_expansion
HAVING COUNT(*)::numeric / NULLIF(MAX(ci.set_number::int), 0) > 5
ORDER BY ratio DESC;
```

`ratio > 5` flags sets where the predicted_collector_max is much smaller than the row count. Two flavours show up:

- **Multi-variant Asian sets** (Gem Pack-style, ratio ≈ 7) — handled correctly by the formula, validated above. Safe to ignore.
- **Wheel sets** (Battle Party / Void Blast, ratio 5–7) — formula-derived data is wrong. Either re-scrape via BrightData (preferred) or fall back to the Playwright scraper at [`scripts/scrape-cardmarket-cards.ts`](../scripts/scrape-cardmarket-cards.ts) for that one slug.

Name patterns that often indicate wheel sets: `Battle Party *`, `Promo Pack *`, `*Tin*`, `*Box Set*`. Not exhaustive — verify by sampling.

---

## 🔄 When to re-run

**BrightData scrape** — re-run when new expansions ship (Cardmarket adds them roughly monthly). Workflow:

```bash
npx tsx scripts/generate-rescrape-input.ts          # builds RESCRAPE_INPUT.json from NULL-prefix expansions
cp scrapers/cardmarket/.actor/RESCRAPE_INPUT.json \
   scrapers/cardmarket/storage/key_value_stores/default/INPUT.json
cd scrapers/cardmarket && npx tsx src/main.ts
```

After a successful scrape, snapshot the result so a future DB reset doesn't lose work:

```bash
npm run snapshot-cardmarket-index
```

**SQL formula** — idempotent (the `WHERE id_expansion NOT IN (...)` clause skips already-mapped expansions). Re-run only when you need the index built immediately and BrightData isn't an option. Don't use it to "fix" wheel sets — it'll re-insert the same wrong numbers.

---

## 🔧 When to fall back to the Playwright scraper

[`scripts/scrape-cardmarket-cards.ts`](../scripts/scrape-cardmarket-cards.ts) was the original approach (pre-BrightData, pre-formula) and is preserved as a third fallback for:

- **Wheel-type promo sets** where the SQL formula produces wrong collector numbers and BrightData isn't set up.
- **Cases where you need accurate `url_path` for deep linking** without running BrightData (the SQL formula leaves `url_path = NULL`).
- **Future-proofing** if Cardmarket changes their `id_product` allocation pattern and BrightData is also unavailable.

The scraper's anti-bot posture (rebrowser-playwright + system Chrome + pre-flight check + batch cooling + OS-aligned UA + 403 diagnostics) is documented in its file header. Run only from a clean residential IP, only on the affected slug. Expect ~5-10 minutes per typical wheel set; do **not** run `--all`.

---

## 📜 History: how I got here

The discovery thread, condensed.

1. **Original plan** — scrape all 738 expansions to populate `cardmarket_card_index` via Playwright. First run got the dev IP banned (Cloudflare 1015) within 100 page loads.
2. **Iteration 1** — tightened pacing (8 s/page, 30 s/expansion), added a kill switch at 2 cumulative 429s, switched to `playwright-extra` + stealth plugin and `channel: 'chrome'`. Got further but still failed mid-scrape on Évolutions Prismatiques.
3. **Iteration 2** — switched to `rebrowser-playwright` for CDP-level patches, added pre-flight check + batch cooling + OS-aligned UA + Cloudflare 403 diagnostics. Got even further but still fragile.
4. **Step back** — surveyed every alternative API (Scryfall is MTG-only, Scrydex is EN+JA and paid, PokémonTCG.io is EN-only and doesn't expose `id_product`). Confirmed Cardmarket itself is the single source of truth.
5. **The SQL realisation** — the dump contains enough structural information to recover `set_number`. `id_product` is sequential per expansion, variants cluster, `card_prefix` is a stable card identifier. Formula derived, validated on 5 scraped sets (3 perfect, 2 known wheels skipped). Got 67 423 product mappings in seconds. Pricing pipeline shipped on this.
6. **The `set_prefix` problem** — the formula gave me `(id_expansion, set_number) → id_product` but I still didn't have the per-expansion S3 image-URL prefix that the `/api/cm-img` proxy needs. That can only be read off Cardmarket's actual pages.
7. **BrightData** — Web Unlocker solves the captcha + bot fingerprinting that broke every Playwright iteration. Switched the scraper to fetch via BrightData proxy ($4.50 / full backfill, ~$0 ongoing for monthly delta scrapes), got real `url_path` and `set_prefix` alongside the existing tuples. Promoted BrightData to primary; SQL formula demoted to rapid-prototyping fallback.

The Playwright code is preserved because if both BrightData and Cardmarket's `id_product` allocation patterns ever change, having that path ready is cheaper than rebuilding from scratch.
