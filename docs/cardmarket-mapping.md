# Cardmarket card_index — SQL formula approach

**TL;DR.** `cardmarket_card_index` (the `(expansion, set_number, variant) → idProduct` map) is now populated by a **SQL formula** derived from the daily Cardmarket dump, not by Playwright scraping. The formula was discovered empirically and validated against 5 already-scraped sets. The Playwright scraper still exists as a fallback for the rare "wheel-type" promo sets where the formula doesn't apply.

---

## Why this matters

For Phase 3 (price display in I.R.I.S), each card needs to be matched to its Cardmarket `id_product` so that the daily pricing dump can be joined. Cardmarket's official dump exposes `id_product`, `name`, `card_prefix`, `id_expansion`, `id_metacard` — but **not** `set_number / collector_number`. Without `set_number`, joining a card from `tcg_catalog` (which has `set_number`) to its Cardmarket product is hard:

- Name fuzzy-match → ambiguous when multiple cards share a name in a set
- Variant disambiguation (Common vs Reverse Holo vs AR) → impossible without per-product variant info

The original solution was a **Playwright gallery scrape** that parses Cardmarket's web UI to extract `set_number` and `url_variant` for each `id_product`. It works but:

- Cardmarket sits behind aggressive Cloudflare protection (Bot Fight Mode + 1015 IP bans)
- A full `--all` scrape takes ~24-40h with strict pacing (15 s/page, 60 s/expansion, 3-5 min cooldown every 25 expansions)
- Running it gets your IP flagged for 24-72 h, forcing you to wait or switch IPs

After hours of fighting Cloudflare (rebrowser-playwright, system Chrome channel, pre-flight checks, batch cooling, OS-aligned UA, response diagnostics — all in [`scripts/scrape-cardmarket-cards.ts`](../scripts/scrape-cardmarket-cards.ts)), we found a much better path that doesn't touch Cardmarket at all.

---

## The discovery

While inspecting the dump's data, three patterns emerged:

1. **`id_product` is sequential within an expansion.** For `id_expansion = 5636` (Crimson Haze), the products are 882917 → 882974 contiguously. No gaps, no holes.

2. **Variants of the same card cluster in consecutive `id_product` values.** In Gem Pack Vol 5, "Captain Pikachu" occupies products 884460–884465 (6 consecutive entries — V1 through V6 of the same logical card). "Braviary" follows at 884598–884605, then "Applin" at 884622–884628.

3. **`card_prefix` (the dump's denormalized card name without bracketed attack disambiguation) reliably identifies a logical card within a set.** Different cards never share `card_prefix` within the same expansion in normal sets; same card across variants always shares it.

Combined: **sorting products by `id_product` within an expansion, then grouping consecutive ones with the same `card_prefix`, gives you the cards in collector_number order.** The Nth group = collector_number N. Within each group, products are ordered V1, V2, V3 etc.

---

## The validated formula

```sql
WITH ordered AS (
  SELECT
    cp.id_expansion, cp.id_product, cp.card_prefix,
    LAG(cp.card_prefix) OVER (PARTITION BY cp.id_expansion ORDER BY cp.id_product) AS prev_prefix
  FROM cardmarket_products cp
),
grouped AS (
  SELECT
    id_expansion, id_product, card_prefix,
    SUM(CASE WHEN card_prefix IS DISTINCT FROM prev_prefix THEN 1 ELSE 0 END)
      OVER (PARTITION BY id_expansion ORDER BY id_product) AS card_group_idx
  FROM ordered
)
SELECT
  g.id_product,
  g.id_expansion,
  DENSE_RANK() OVER (PARTITION BY g.id_expansion ORDER BY g.card_group_idx)::text AS set_number,
  CASE
    WHEN COUNT(*) OVER (PARTITION BY g.id_expansion, g.card_group_idx) > 1
    THEN 'V' || ROW_NUMBER() OVER (PARTITION BY g.id_expansion, g.card_group_idx ORDER BY g.id_product)::text
    ELSE NULL
  END AS url_variant
FROM grouped g;
```

Wrapped in `INSERT INTO cardmarket_card_index (id_product, id_expansion, set_number, url_variant, language, url_path) ...` with `language = 'fr'` and `url_path = NULL` (not derivable from the dump alone — synthesise on demand if a deep link is needed).

**Skip already-scraped expansions** by adding `WHERE id_expansion NOT IN (SELECT DISTINCT id_expansion FROM cardmarket_card_index)` in the source CTE. The scrape-derived rows are ground truth for those sets and must not be overwritten — they include the wheel sets where the formula is wrong (see below).

---

## Validation results

| Set | Products | Predicted vs actual | Verdict |
|---|---|---|---|
| Crimson Haze (5636) | 96 | 96/96 ✅ | Standard SV booster — perfect |
| Gem Pack Vol 5 (6544) | 196 | 196/196 ✅ | Multi-variant Asian set (7 variants/card) — perfect |
| Golden Energy (6548) | 54 | 54/54 ✅ | Energy promo set — perfect |
| Battle Party Set (6549) | 47 | 9/47 ❌ | Wheel-type promo (collector range 0–9) — fails |
| Void Blast (6519) | 58 | 0/58 ❌ | Wheel-type promo (collector range 0–9) — fails |

The formula handles **standard booster sets, multi-variant Asian sets, and standalone promo sheets** correctly. It fails on **wheel-type promo packs** (sets where Cardmarket assigns collector numbers 0–9 cyclically across many cards), because in those, the relationship between `id_product` order and collector_number is non-deterministic from the dump alone.

The 5 already-scraped sets remain untouched by the formula INSERT (the `WHERE NOT IN ...` filter protects them), so the wheel sets retain their correct scrape-derived data.

---

## Identifying wheel sets

Wheel sets cannot be detected from the dump alone (they often have a 1:1 product-to-card-name ratio, the same as a normal small booster). The reliable signal is **collector_number range 0–9 with many products** — but you only see that after scraping or after the formula produces obviously suspect numbers.

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

`ratio > 5` flags sets where the predicted_collector_max is much smaller than the row count — typically multi-variant sets (Gem Pack-style: ratio ≈ 7) or wheel sets (Battle Party / Void Blast: ratio 5–7). Multi-variant sets are correctly handled (verified). Wheel sets need manual scraping with [`scripts/scrape-cardmarket-cards.ts`](../scripts/scrape-cardmarket-cards.ts).

**Name patterns that often indicate wheel sets:** `Battle Party *`, `Promo Pack *`, `*Tin*`, `*Box Set*`. Not exhaustive.

---

## When to re-run the formula

The formula is idempotent on already-mapped products (the `INSERT` would conflict on the `id_product` primary key). Re-run when:

- New expansions ship and `npm run upload-cardmarket-dumps` lands new rows in `cardmarket_products` — the formula picks up the new `id_expansion` automatically (it processes any expansion not already in `cardmarket_card_index`)
- A wheel set was incorrectly mapped and has been cleaned up via `DELETE FROM cardmarket_card_index WHERE id_expansion = N`, then re-scraped manually

There's no need to run it on a schedule. The Cardmarket S3 dump only adds new products when Cardmarket releases new sets, which is monthly at most.

---

## When to fall back to the Playwright scraper

[`scripts/scrape-cardmarket-cards.ts`](../scripts/scrape-cardmarket-cards.ts) remains the only way to populate `cardmarket_card_index` for:

- **Wheel-type promo sets** (Battle Party, Void Blast, etc.) where the SQL formula produces wrong collector numbers
- **Sets where Cardmarket changes their slug-to-collector encoding** in the future, breaking the formula's assumptions
- **Cases where you need accurate `url_path`** for deep linking — the formula leaves `url_path = NULL`, the scraper extracts the actual Cardmarket URL slug

The scraper's anti-bot posture (rebrowser-playwright + system Chrome + pre-flight check + batch cooling + OS-aligned UA + 403 diagnostics) is documented in its file header. Run only from a clean residential IP, expect ~5-10 minutes per typical wheel set.

---

## History

The discovery thread, condensed:

1. Original plan: scrape all 738 expansions to populate `cardmarket_card_index`. First run got the dev IP banned (Cloudflare 1015) within 100 page loads.
2. Iteration: tightened pacing (8 s/page, 30 s/expansion), added kill switch at 2 cumulative 429s, switched to `playwright-extra` + stealth plugin and channel: 'chrome'. Got further but still failed mid-scrape on PRE.
3. Iteration: switched to `rebrowser-playwright` for CDP-level patches, added pre-flight check + batch cooling + OS-aligned UA + Cloudflare 403 diagnostics. Got even further but still fragile.
4. Realised the dump itself contains the structural information needed: `id_product` is sequential per expansion, variants cluster, `card_prefix` is a stable card identifier. Formula derived, validated on 5 scraped sets (3 perfect, 2 known wheels skipped).
5. INSERT formula populated 67 423 product mappings across 738 expansions in seconds. Scraper demoted to fallback.
