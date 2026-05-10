# Cardmarket card_index mapping

## ⚠️ Note 2026-05-10 — État actuel

**`cardmarket_card_index` est populé par le scraper BrightData** dans [`scrapers/cardmarket/`](../scrapers/cardmarket/) — pas par la formule SQL ci-dessous. Le scraper visite chaque page d'expansion sur cardmarket via BrightData Web Unlocker et extrait les tuples réels `(id_product, set_number, url_variant, url_path, set_prefix)`.

**Important : capture du `set_prefix`.** Depuis 2026-05-10, le scraper extrait aussi le préfixe S3 (`BRS`, `LOR`, `sv2a`, `BKR`...) depuis le `<img src>` de chaque carte et l'écrit sur `cardmarket_expansions.set_prefix`. C'est cette valeur qui :
- Sert de pivot à la Strategy 0 d'enrich (`set_prefix` → `id_expansion` → `set_number` → `id_product`)
- Permet à [`/api/cm-img/[id]?prefix={set_prefix}`](../app/api/cm-img/%5Bid%5D/route.ts) de construire l'URL S3 correcte

**Couverture actuelle** : 529/741 expansions scrapées (~71%). Les 212 NULL sont surtout des sets très anciens, FR localisations (doublons EN), promos JP rares. Pour rescraper les manquants, voir [COMMANDS.md → generate-rescrape-input.ts](COMMANDS.md#generate-rescrape-inputts).

**Bug regex JP fixé 2026-05-10** : l'ancien regex `[A-Z]+\d+$` du parser refusait les codes JP avec digits embedded (`sv1a074`, `sv2a169`, `s12a015`) et silencieusement extrayait 0 cartes pour tout le catalogue SV JP. Nouveau regex `[A-Za-z][A-Za-z0-9]*?[A-Za-z]\d+$` (cf [`scrapers/cardmarket/src/scrape.ts`](../scrapers/cardmarket/src/scrape.ts) + [scrape.test.ts](../scrapers/cardmarket/src/scrape.test.ts) avec test de régression).

La formule SQL ci-dessous est gardée comme **historique** + outil de fallback rapide pour les wheel-type promo sets si BrightData devient indisponible.

---

You're looking at how `cardmarket_card_index` — the `(expansion, set_number, variant) → idProduct` map that powers the FAST PATH in [`lib/api/cardmarket-pricing.ts`](../lib/api/cardmarket-pricing.ts) — actually gets populated. The short answer: a deterministic SQL formula derives it from the daily Cardmarket dump itself, no scraping involved. The long answer is the rest of this file, including how I got there after burning hours fighting Cloudflare.

The Playwright scraper at [`scripts/scrape-cardmarket-cards.ts`](../scripts/scrape-cardmarket-cards.ts) still exists, but it's now a fallback for the rare wheel-type promo sets where the formula doesn't apply. For 95 %+ of the catalogue, you don't need to touch it. For an overview of where this fits in the pricing pipeline, see [ARCHITECTURE.md](ARCHITECTURE.md#data-flow-pricing-pipeline).

## Table of contents

- [Why this matters](#-why-this-matters)
- [The discovery](#-the-discovery)
- [The formula](#-the-formula)
- [Validation results](#-validation-results)
- [Wheel-type promos: the edge case](#-wheel-type-promos-the-edge-case)
- [When to re-run](#-when-to-re-run)
- [When to fall back to the scraper](#-when-to-fall-back-to-the-scraper)
- [History: how I got here](#-history-how-i-got-here)

---

## 🎯 Why this matters

Phase 3 (Cardmarket pricing on every for-sale card) needs each card in `tcg_catalog` to be matched to its Cardmarket `id_product`, so the daily pricing dump in `cardmarket_pricing` can be joined. The catch: Cardmarket's official dump exposes `id_product`, `name`, `card_prefix`, `id_expansion`, `id_metacard` — but **not** `set_number / collector_number`.

Without `set_number`, joining a `tcg_catalog` row to the right Cardmarket product is a nightmare:

- **Name fuzzy-match** — ambiguous when multiple cards share a name in a set (think "Pikachu" appearing five times in one set with different attacks).
- **Variant disambiguation** (Common vs Reverse Holo vs AR) — impossible from the dump's name field alone.

The original solution was a Playwright gallery scrape that parses Cardmarket's web UI to extract `set_number` and `url_variant` for each `id_product`. It works, but Cardmarket sits behind aggressive Cloudflare protection (Bot Fight Mode + 1015 IP bans). A full `--all` scrape requires ~24-40 h of strict pacing and gets your IP flagged for 24-72 h on the first mistake.

After enough Cloudflare bans to wear out my patience, I found a better path that doesn't touch Cardmarket at all.

---

## 🔍 The discovery

Three patterns in the dump made the formula possible.

### 1. `id_product` is sequential within an expansion

For `id_expansion = 5636` (Crimson Haze), the products are numbered 882917 → 882974 contiguously. Every expansion follows this pattern: products allocated in one batch when the set is added to Cardmarket's database.

### 2. Variants of the same card cluster in consecutive `id_product` values

In Gem Pack Vol 5, "Captain Pikachu" occupies products 884460–884465 (six consecutive entries — V1 through V6 of the same logical card across language printings). "Braviary" follows at 884598–884605, then "Applin" at 884622–884628.

### 3. `card_prefix` reliably identifies a logical card within a set

The dump's `card_prefix` (denormalised card name without bracketed attack disambiguation) is unique per logical card within an expansion, and shared across all variants of that card. Different cards never collide on `card_prefix` within the same set in normal sets; the same card across variants always shares it.

**Combine the three** and you get the formula: sort products by `id_product` within an expansion, group consecutive ones with the same `card_prefix`, and the Nth group is collector_number N. Within each group, products are V1, V2, V3 in `id_product` order.

---

## 🧮 The formula

Run once per fresh dump in the Supabase SQL editor:

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

## ✅ Validation results

Tested against the 5 expansions that were already manually scraped before the formula existed.

| Set | Products | Predicted vs actual | Verdict |
|---|---|---|---|
| **Crimson Haze** (5636) | 96 | 96/96 ✅ | Standard SV booster — perfect |
| **Gem Pack Vol 5** (6544) | 196 | 196/196 ✅ | Multi-variant Asian set (7 variants/card) — perfect |
| **Golden Energy** (6548) | 54 | 54/54 ✅ | Energy promo set — perfect |
| **Battle Party Set** (6549) | 47 | 9/47 ❌ | Wheel-type promo (collector range 0–9) — fails |
| **Void Blast** (6519) | 58 | 0/58 ❌ | Wheel-type promo (collector range 0–9) — fails |

Three of five sets match perfectly. They cover the three shapes that account for ~95 % of Pokémon TCG sets: standard boosters (1 product per card), multi-variant Asian sets (N products per card with consecutive id_products), standalone promo sheets (1 product per card with no variants).

The two failures are wheel-type promo packs, where Cardmarket's collector_number assignment is non-deterministic. They're known and handled — see below.

---

## 🎡 Wheel-type promos: the edge case

A wheel set is a promo product (Battle Party Set, Void Blast) where Cardmarket assigns collector numbers 0–9 cyclically across many cards. The relationship between `id_product` order and collector_number is not deterministic in these sets, and the formula produces wrong numbers.

**You can't detect them from the dump alone.** They often look like normal small booster sets (1 product per card, 50 unique names). The reliable signal is the actual collector range on Cardmarket — which you only see by scraping, or by comparing formula output to ground truth.

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
- **Wheel sets** (Battle Party / Void Blast, ratio 5–7) — formula-derived data is wrong. Need the Playwright scraper.

**Name patterns that often indicate wheel sets:** `Battle Party *`, `Promo Pack *`, `*Tin*`, `*Box Set*`. Not exhaustive — verify by sampling.

---

## 🔄 When to re-run

The formula is idempotent. The `INSERT` would conflict on the `id_product` primary key if applied twice, and the `WHERE id_expansion NOT IN (...)` clause skips already-mapped expansions naturally.

Re-run the formula when:

- **New expansions ship.** The daily `npm run upload-cardmarket-dumps` cron lands new rows in `cardmarket_products` whenever Cardmarket adds an expansion (typically monthly). The formula picks them up automatically since they won't be in `cardmarket_card_index` yet.
- **A wheel set was incorrectly mapped and you want to retry.** After running `DELETE FROM cardmarket_card_index WHERE id_expansion = N`, the next formula run will re-insert with formula-derived (wrong) values — so don't bother. Use the scraper directly for wheels (see next section).

There's no need to schedule the formula. Manual run after major dump updates is sufficient.

---

## 🔧 When to fall back to the scraper

[`scripts/scrape-cardmarket-cards.ts`](../scripts/scrape-cardmarket-cards.ts) remains the only way to populate `cardmarket_card_index` for:

- **Wheel-type promo sets** where the formula produces wrong collector numbers.
- **Sets where Cardmarket changes their slug-to-collector encoding** in the future, breaking the formula's assumptions.
- **Cases where you need accurate `url_path`** for deep linking — the formula leaves `url_path = NULL`, the scraper extracts the actual Cardmarket URL slug.

The scraper's anti-bot posture (rebrowser-playwright + system Chrome + pre-flight check + batch cooling + OS-aligned UA + 403 diagnostics) is fully documented in its file header. Run only from a clean residential IP. Expect ~5-10 minutes per typical wheel set; do **not** run `--all` (the formula already covers everything except the wheels).

---

## 📜 History: how I got here

The discovery thread, condensed.

1. **Original plan** — scrape all 738 expansions to populate `cardmarket_card_index`. First run got the dev IP banned (Cloudflare 1015) within 100 page loads.
2. **Iteration 1** — tightened pacing (8 s/page, 30 s/expansion), added a kill switch at 2 cumulative 429s, switched to `playwright-extra` + stealth plugin and `channel: 'chrome'`. Got further but still failed mid-scrape on Évolutions Prismatiques.
3. **Iteration 2** — switched to `rebrowser-playwright` for CDP-level patches, added pre-flight check + batch cooling + OS-aligned UA + Cloudflare 403 diagnostics. Got even further but still fragile.
4. **Step back** — surveyed every alternative API (Scryfall is MTG-only, Scrydex is EN+JA and paid, PokémonTCG.io is EN-only and doesn't expose `id_product`). Confirmed Cardmarket itself is the single source of truth and there's no shortcut via third parties.
5. **The realisation** — the dump contains the structural information needed all along. `id_product` is sequential per expansion, variants cluster, `card_prefix` is a stable card identifier. Formula derived, validated on 5 scraped sets (3 perfect, 2 known wheels skipped).
6. **Outcome** — the INSERT formula populated 67 423 product mappings across 738 expansions in seconds. Scraper demoted to fallback.

The scraper code is preserved because the wheel-set edge case still needs it, and because if Cardmarket ever changes their `id_product` allocation pattern, having the Playwright path ready is cheaper than rebuilding from scratch.
