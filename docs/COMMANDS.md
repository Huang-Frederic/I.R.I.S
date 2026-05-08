# Commands reference

Every command available in the repo, what it does, and when you'd use it.

## Table of contents

- [npm scripts](#npm-scripts) — daily dev workflow
- [Catalog scripts](#catalog-scripts) — populate / refresh the offline TCG catalog
- [Cardmarket scripts](#cardmarket-scripts) — pricing dumps + per-expansion gallery scrape
- [Backup / snapshot scripts](#backup--snapshot-scripts) — manual data dumps
- [Diagnostic scripts](#diagnostic-scripts) — inspect Supabase state, OCR debug, model benchmarks
- [Utility scripts](#utility-scripts) — one-off helpers

---

## npm scripts

Defined in [`package.json`](../package.json), invoked via `npm run <name>`.

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Next.js dev server on `http://localhost:3000`. |
| `npm run build` | Production build. Runs the type checker and bundles. |
| `npm run start` | Run the production build (call after `npm run build`). |
| `npm run typecheck` | `tsc --noEmit` — verify TypeScript without emitting JS. |
| `npm run lint` | ESLint pass on the whole repo. |
| `npm run format` | Prettier write — auto-format all files. |
| `npm run format:check` | Prettier verify — fail if anything is unformatted. |
| `npm test` | Vitest, single run. |
| `npm run test:watch` | Vitest in watch mode. |

### Cardmarket-specific npm scripts

| Command | Purpose |
|---|---|
| `npm run upload-cardmarket-dumps` | Pull the latest Cardmarket S3 dumps (products + pricing) and bulk-upsert into Supabase. ~30s. Runs daily via GitHub Action. |
| `npm run scrape-cardmarket -- <args>` | Per-expansion gallery scrape to populate `cardmarket_card_index` (the `(set, number) → idProduct` map). See dedicated section below. |
| `npm run probe-cardmarket -- <slug>` | One-shot debug: open one Cardmarket page, dump the HTML to disk, print quick stats. Used for inspecting page structure before changing the scraper. |

### Backup/restore npm scripts

| Command | Purpose |
|---|---|
| `npm run snapshot-catalog` | Dump `tcg_catalog` to gzipped JSON in `backups/`. Run before major catalog re-scrapes. |
| `npm run restore-catalog` | Restore `tcg_catalog` from a gzipped snapshot. |

---

## Catalog scripts

Located in [`scripts/`](../scripts/), invoked with `npx tsx scripts/<name>.ts`.

### `scrape-limitlesstcg.ts`

Populates the local Pokémon TCG catalog from LimitlessTCG (the offline lookup source for enrichment).

```bash
npx tsx scripts/scrape-limitlesstcg.ts                       # base scrape, JP+EN+FR, ~12 min
SCRAPE_ILLUSTRATOR=1 npx tsx scripts/scrape-limitlesstcg.ts  # full scrape with illustrator, ~3h
LANGUAGES=jp,en npx tsx scripts/scrape-limitlesstcg.ts       # restrict to specific languages
MODE=full npx tsx scripts/scrape-limitlesstcg.ts             # full scrape (default)
```

Resume-safe: queries the DB to skip sets already scraped. Concurrency 5.

If the script fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE` (Node 22 on WSL2 behind strict proxy):
```bash
export INSECURE_HTTPS=1
```

### `fetch-pokemon-names.ts`

Refreshes [`lib/data/pokemon-names.ts`](../lib/data/pokemon-names.ts) from PokeAPI. Run when a new generation drops.

```bash
npx tsx scripts/fetch-pokemon-names.ts
```

---

## Cardmarket scripts

### `parse-cardmarket-expansions.ts`

One-off: parses Cardmarket's FR-locale expansion dropdown HTML to produce [`cardmarket_expansions.json`](../cardmarket_expansions.json) (741 entries committed in repo).

Re-run only when Cardmarket adds new expansions:

```bash
# 1. Save the rendered HTML of the FR singles dropdown to cardmarket_expansions.html
# 2. Parse it
npx tsx scripts/parse-cardmarket-expansions.ts
```

### `upload-cardmarket-dumps.ts`

Mirrors Cardmarket's public S3 dumps into Supabase tables `cardmarket_expansions`, `cardmarket_products`, `cardmarket_pricing`.

```bash
npm run upload-cardmarket-dumps          # default: fetch from S3
npm run upload-cardmarket-dumps -- --local   # use already-downloaded files
```

Required env: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

### `scrape-cardmarket-cards.ts` (gallery scraper)

Per-expansion Playwright scrape that builds the fast-path lookup index `cardmarket_card_index`. For each card on a Cardmarket gallery page, captures `idProduct`, `set_number`, `url_variant`, and `url_path`.

```bash
# Single expansion
npm run scrape-cardmarket -- Crimson-Haze

# Multiple
npm run scrape-cardmarket -- 151 Evolutions XY Pokemon-Card-151

# All ~280 modern sets (SV+, 2023+)
npm run scrape-cardmarket -- --modern

# All 741 expansions (overnight)
npm run scrape-cardmarket -- --all

# Filter by id_expansion
npm run scrape-cardmarket -- --since=5500

# Re-scrape even if already in index
npm run scrape-cardmarket -- --force --modern

# Dry run (no DB writes)
npm run scrape-cardmarket -- --dry-run Crimson-Haze
```

**Resume-safe**: skips expansions that already have rows in `cardmarket_card_index`.

**Rate-limit posture**: 2.5s between pages, 5–8s between expansions, retries with exponential cooldown on HTTP 429, kill switch at 5 cumulative 429s.

### `recommend-scrape-targets.ts`

Reads your `cards` table, matches each distinct `set_name` against `cardmarket_expansions`, and prints the optimal targeted scrape command (only the expansions you actually own).

```bash
npx tsx scripts/recommend-scrape-targets.ts
```

Outputs are deduplicated, include FR-translation hints (Prismatic Evolutions → Évolutions Prismatiques), and skip already-scraped expansions.

### `probe-cardmarket-expansion.ts`

One-shot Playwright probe: opens one Cardmarket page, saves the HTML, prints quick stats. Useful when CM changes their DOM and you need to update the scraper.

```bash
npx tsx scripts/probe-cardmarket-expansion.ts Crimson-Haze
npx tsx scripts/probe-cardmarket-expansion.ts Crimson-Haze/Bloodmoon-Ursaluna-ex-V1-sv5a052   # also works with full product paths
```

---

## Backup / snapshot scripts

### `snapshot-catalog.ts`

Dumps `tcg_catalog` to a gzipped JSON file in [`backups/`](../backups/). Used before re-scraping (catalog version snapshot).

```bash
npm run snapshot-catalog                                     # writes backups/tcg-catalog-<timestamp>.json.gz
```

### `restore-catalog.ts`

Restores the catalog from a snapshot file.

```bash
npm run restore-catalog                                      # restores latest backups/tcg-catalog-*.json.gz
npm run restore-catalog -- <path/to/snapshot.json.gz>        # restores a specific snapshot
```

### Manual backups via the UI

The Options page exposes **Sauvegarde manuelle** which dumps 8 user-data tables to a gzipped JSON file in the Supabase `manual-backups` bucket. Files are listed with a Download (signed URL, 1h expiry) and Delete action. Never auto-rotated.

### Daily backup via GitHub Actions

[`.github/workflows/backup.yml`](../.github/workflows/backup.yml) runs `pg_dump --data-only` on 8 user-data tables, gzips the result, and publishes a tagged release `backup-daily-YYYY-MM-DD`. Rotation: 30 daily / 12 weekly / 12 monthly via [`scripts/backup/rotate.sh`](../scripts/backup/rotate.sh).

Trigger manually via GitHub Actions tab → "Daily backup" → "Run workflow".

---

## Diagnostic scripts

### `check-supabase-state.ts`

Lists every expected Supabase table, counts rows, and flags missing tables. Run after applying migrations to verify the DB is fully provisioned.

```bash
npx tsx scripts/check-supabase-state.ts
```

Sample output:
```
TABLE                         STATUS
------------------------------------------------------------
user_profiles                 2 rows
cards                         13 rows
tcg_catalog                   52,724 rows
cardmarket_expansions         741 rows
cardmarket_card_index         0 rows
============================================================
Cardmarket scrape readiness:
  ✓ Dumps loaded (67,650 products)
  ✗ Index empty — run: npm run scrape-cardmarket -- --modern
```

### `inspect-ocr.ts`

Run the OCR pipeline on a local image and print every intermediate step (Gemini raw response, parsed JSON, fallback decisions).

```bash
npx tsx scripts/inspect-ocr.ts <path/to/card.jpg>
```

Useful when a card returns wrong enrichment results — shows what the engine actually saw.

### `bench-multi-model.ts`

Benchmark multiple Gemini model variants against a fixed test set, output CSV with accuracy + cost + latency per model. Used to validate model switches.

```bash
npx tsx scripts/bench-multi-model.ts
```

Outputs to [`results/test-bench-*.csv`](../results/).

### `bench-multilang.ts`

Cross-language enrichment accuracy benchmark — verify the catalog + Gemini handle JP / EN / FR / KO / CN cards equally well.

```bash
npx tsx scripts/bench-multilang.ts
```

### `probe-tcgdex-fails.ts`

Dump TCGdex API failures (cards where the enrichment fell back to live API and got a 404 / timeout). Used to identify catalog gaps.

```bash
npx tsx scripts/probe-tcgdex-fails.ts
```

---

## Utility scripts

### `seed/seed.ts`

Wipes the `cards` table and inserts ~30 representative cards from `cards_assets/` photos. Distribution covers all UI flows (sold, pokedex, collection, for_sale online/offline/stale).

```bash
npx tsx scripts/seed/seed.ts
```

⚠️ **Destructive** — wipes `cards` table. Only run in dev / fresh setups.

### `wipe-user-data.sql`

SQL-only script (run manually via psql or SQL Editor). Wipes user data from `cards`, `lots`, `card_listings`, `lot_listings` while preserving the catalog and Cardmarket tables.

```bash
psql $DATABASE_URL -f scripts/wipe-user-data.sql
```

⚠️ **Destructive**. Read the file before running.

---

## API endpoints (cron / authenticated)

These are HTTP endpoints, not CLI scripts, but they're sometimes triggered manually for debugging.

### `POST /api/prices/update` (cron)

Daily price refresh. Authenticated via `Authorization: Bearer $CRON_SECRET`. Pulls 200 oldest cards `for_sale`, looks up each via `cardmarket-pricing.ts`, updates `cm_price_*` columns.

```bash
# Manual trigger (production)
curl -X POST https://your-app.vercel.app/api/prices/update \
  -H "Authorization: Bearer $CRON_SECRET"

# Single card refresh (auth via Supabase session — used by the UI button)
curl -X POST "http://localhost:3000/api/prices/update?card_id=<uuid>" \
  --cookie "<your supabase session cookie>"
```

### `POST /api/backup/manual` (auth)

Triggered from the Options page UI. Dumps 8 user-data tables, gzips, uploads to `manual-backups` bucket.

---

## Environment variables reference

| Variable | Used by | Required for |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | All Supabase clients | All features |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-side Supabase | Auth + reads |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase + scripts | Mutations + cron + scripts |
| `GOOGLE_VISION_API_KEY` | OCR fallback | Scanning when Gemini fails |
| `GEMINI_API_KEY` | Primary OCR | Scanning |
| `CRON_SECRET` | `/api/prices/update` | Daily price cron |
| `NEXT_PUBLIC_APP_URL` | Auth redirects | Production deploy |
| `INSECURE_HTTPS` | LimitlessTCG scraper | WSL2 SSL workaround (optional) |
| `SCRAPE_ILLUSTRATOR` | LimitlessTCG scraper | Toggle illustrator field (optional) |
| `LANGUAGES` | LimitlessTCG scraper | Restrict scraped languages (optional) |
| `MODE` | LimitlessTCG scraper | `full` (default) or `incremental` (optional) |
