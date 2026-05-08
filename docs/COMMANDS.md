# Commands reference

Every script you'll run, and what it actually does. From daily dev workflow to one-off catalog re-scrapes, this is the complete reference organized by purpose.

## Table of contents

- [📦 npm scripts](#-npm-scripts) — daily dev workflow
- [🎴 Catalog scripts](#-catalog-scripts) — populate / refresh the offline TCG catalog
- [💰 Cardmarket scripts](#-cardmarket-scripts) — pricing dumps + per-expansion gallery scrape
- [💾 Backup / snapshot scripts](#-backup--snapshot-scripts) — manual data dumps
- [🔍 Diagnostic scripts](#-diagnostic-scripts) — inspect Supabase state, OCR debug, model benchmarks
- [🛠 Utility scripts](#-utility-scripts) — one-off helpers
- [🔌 API endpoints](#-api-endpoints-cron--authenticated) — cron / authenticated
- [🔑 Environment variables](#-environment-variables-reference) — all env vars

---

## 📦 npm scripts

Your daily dev workflow lives here. Defined in [`package.json`](../package.json), invoked via `npm run <name>`.

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
| `npm run snapshot-cardmarket-index` | Dump `cardmarket_card_index` (gallery scrape) to gzipped JSON in `backups/`. Run after each successful `scrape-cardmarket --modern`/`--all`. |
| `npm run restore-cardmarket-index` | Restore `cardmarket_card_index` from the snapshot — use after a fresh DB import. |

---

## 🎴 Catalog scripts

You won't touch these often — but when you need to rebuild the offline TCG catalog or update Pokémon names, this is where you go. Located in [`scripts/`](../scripts/), invoked with `npx tsx scripts/<name>.ts`.

### `scrape-limitlesstcg.ts`

This is how you populate the 52K-card local catalog from LimitlessTCG — the offline lookup source for enrichment. Resume-safe, concurrency 5.

```bash
npx tsx scripts/scrape-limitlesstcg.ts                       # base scrape, JP+EN+FR, ~12 min
SCRAPE_ILLUSTRATOR=1 npx tsx scripts/scrape-limitlesstcg.ts  # full scrape with illustrator, ~3h
LANGUAGES=jp,en npx tsx scripts/scrape-limitlesstcg.ts       # restrict to specific languages
MODE=full npx tsx scripts/scrape-limitlesstcg.ts             # full scrape (default)
```

If the script fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE` (Node 22 on WSL2 behind strict proxy):
```bash
export INSECURE_HTTPS=1
```

### `fetch-pokemon-names.ts`

Refreshes [`lib/data/pokemon-names.ts`](../lib/data/pokemon-names.ts) from PokeAPI. Run this when a new generation drops and you need the latest 1 025+ Pokémon names.

```bash
npx tsx scripts/fetch-pokemon-names.ts
```

---

## 💰 Cardmarket scripts

The pricing machinery. Daily dumps, gallery scrapes, and one-off expansion probes — everything you need to keep the `(expansion, set_number) → idProduct` index fresh.

### `parse-cardmarket-expansions.ts`

One-off helper. Parses Cardmarket's FR-locale expansion dropdown HTML to produce [`cardmarket_expansions.json`](../cardmarket_expansions.json) (741 entries committed in repo). Re-run only when Cardmarket adds new expansions:

```bash
# 1. Save the rendered HTML of the FR singles dropdown to cardmarket_expansions.html
# 2. Parse it
npx tsx scripts/parse-cardmarket-expansions.ts
```

### `upload-cardmarket-dumps.ts`

This is the daily price sync. Mirrors Cardmarket's public S3 dumps (67K products + 72K pricing rows) into Supabase tables `cardmarket_expansions`, `cardmarket_products`, `cardmarket_pricing`. Runs daily via GitHub Action.

```bash
npm run upload-cardmarket-dumps          # default: fetch from S3
npm run upload-cardmarket-dumps -- --local   # use already-downloaded files
```

Required env: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

### `scrape-cardmarket-cards.ts` (gallery scraper)

The heavy lifter. Per-expansion Playwright scrape that builds the exact-match lookup index `cardmarket_card_index`. For each card on a Cardmarket gallery page, captures `idProduct`, `set_number`, `url_variant`, and `url_path`. Resume-safe, rate-limit aware.

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

**Rate-limit posture**: 2.5s between pages, 5–8s between expansions, retries with exponential cooldown on HTTP 429, kill switch at 5 cumulative 429s.

### `recommend-scrape-targets.ts`

Smart scraper planner. Reads your `cards` table, matches each distinct `set_name` against `cardmarket_expansions`, and prints the optimal targeted scrape command — only the expansions you actually own. Outputs are deduplicated, include FR-translation hints (Prismatic Evolutions → Évolutions Prismatiques), and skip already-scraped expansions.

```bash
npx tsx scripts/recommend-scrape-targets.ts
```

### `probe-cardmarket-expansion.ts`

One-shot debug probe. Opens one Cardmarket page, saves the HTML, prints quick stats. Useful when CM changes their DOM and you need to update the scraper.

```bash
npx tsx scripts/probe-cardmarket-expansion.ts Crimson-Haze
npx tsx scripts/probe-cardmarket-expansion.ts Crimson-Haze/Bloodmoon-Ursaluna-ex-V1-sv5a052   # also works with full product paths
```

---

## 💾 Backup / snapshot scripts

You won't touch most of these directly. They're called by cron, by other scripts, or by you when something breaks and you need to rewind.

### `snapshot-catalog.ts`

Catalog snapshot. Dumps `tcg_catalog` to a gzipped JSON file in [`backups/`](../backups/). Run this before major re-scrapes so you can roll back if needed.

```bash
npm run snapshot-catalog                                     # writes backups/tcg-catalog-<timestamp>.json.gz
```

### `restore-catalog.ts`

Catalog restore. Restores the catalog from a snapshot file. Pass a specific path or let it pick the latest.

```bash
npm run restore-catalog                                      # restores latest backups/tcg-catalog-*.json.gz
npm run restore-catalog -- <path/to/snapshot.json.gz>        # restores a specific snapshot
```

### `snapshot-cardmarket-index.ts`

Gallery scrape snapshot. Dumps `cardmarket_card_index` (the `(expansion, set_number) → idProduct` map populated by the Playwright scrape) to a gzipped JSONL file in [`backups/`](../backups/). Run after each successful `npm run scrape-cardmarket -- --modern` or `--all` so the ~6h to ~16h of work + Cloudflare-1015 risk are protected — the daily GitHub Action backup only covers user-data tables, not this one.

```bash
npm run snapshot-cardmarket-index                            # writes backups/cardmarket_card_index.jsonl.gz
```

### `restore-cardmarket-index.ts`

Gallery scrape restore. Truncates `cardmarket_card_index` and re-inserts every row from the snapshot. Asks for confirmation before truncating; pass `SKIP_CONFIRM=1` for non-interactive use.

```bash
npm run restore-cardmarket-index                             # restores backups/cardmarket_card_index.jsonl.gz
SKIP_CONFIRM=1 npm run restore-cardmarket-index              # no prompt
```

### Manual backups via the UI

The Options page exposes **Sauvegarde manuelle** — a one-click backup that dumps 8 user-data tables to a gzipped JSON file in the Supabase `manual-backups` bucket. Files are listed with a Download (signed URL, 1h expiry) and Delete action. Never auto-rotated.

### Daily backup via GitHub Actions

[`.github/workflows/backup.yml`](../.github/workflows/backup.yml) runs `pg_dump --data-only` on 8 user-data tables, gzips the result, and publishes a tagged release `backup-daily-YYYY-MM-DD`. Rotation: 30 daily / 12 weekly / 12 monthly via [`scripts/backup/rotate.sh`](../scripts/backup/rotate.sh). Trigger manually via GitHub Actions tab → "Daily backup" → "Run workflow".

> **Note** — the daily backup covers the 8 user-data tables only. Catalog and Cardmarket tables are not included. Use the dedicated snapshots: `npm run snapshot-catalog` for `tcg_catalog`, `npm run snapshot-cardmarket-index` for the gallery scrape.

### Wiping data / fresh start

The full reset choreography for spinning up a brand-new Supabase project (region change, polluted state, etc.) lives in [`SUPABASE.md → Reset procedure`](SUPABASE.md#♻️-reset-procedure). For partial wipes on the current project:

| What | How |
|---|---|
| Wipe `cards` table only + reseed dev cards | `tsx scripts/seed/seed.ts` (⚠️ destructive, dev-only) |
| Wipe all user data (cards, lots, listings) keeping catalog + Cardmarket intact | `psql $DATABASE_URL -f scripts/seed/wipe-user-data.sql` |
| Full reset on a new Supabase project | Follow [`SUPABASE.md → Reset procedure`](SUPABASE.md#♻️-reset-procedure) |

---

## 🔍 Diagnostic scripts

Inspect Supabase state, debug OCR failures, benchmark model variants, or hunt for catalog gaps — these are your troubleshooting tools.

### `check-supabase-state.ts`

Your post-migration sanity check. Lists every expected Supabase table, counts rows, flags missing tables. Run this after applying migrations to verify the DB is fully provisioned.

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

OCR debugger. Run the full OCR pipeline on a local image and print every intermediate step — Gemini raw response, parsed JSON, fallback decisions. Useful when a card returns wrong enrichment results; shows you what the engine actually saw.

```bash
npx tsx scripts/inspect-ocr.ts <path/to/card.jpg>
```

### `bench-multi-model.ts`

Model comparison benchmark. Tests multiple Gemini model variants against a fixed test set, outputs CSV with accuracy + cost + latency per model. Run this when you're considering a model switch and need hard numbers.

```bash
npx tsx scripts/bench-multi-model.ts
```

Outputs to [`results/test-bench-*.csv`](../results/).

### `bench-multilang.ts`

Cross-language accuracy check. Verifies the catalog + Gemini handle JP / EN / FR / KO / CN cards equally well.

```bash
npx tsx scripts/bench-multilang.ts
```

### `probe-tcgdex-fails.ts`

Catalog gap finder. Dumps TCGdex API failures — cards where the enrichment fell back to live API and got a 404 / timeout. Use this to identify which sets are missing from the local catalog.

```bash
npx tsx scripts/probe-tcgdex-fails.ts
```

---

## 🛠 Utility scripts

One-off helpers and dev setup tools.

### `seed/seed.ts`

Dev setup helper. Wipes the `cards` table and inserts ~30 representative cards from `cards_assets/` photos. Distribution covers all UI flows (sold, pokedex, collection, for_sale online/offline/stale).

```bash
npx tsx scripts/seed/seed.ts
```

⚠️ **Destructive** — wipes `cards` table. Only run in dev / fresh setups.

### `wipe-user-data.sql`

Nuclear option. SQL-only script (run manually via psql or SQL Editor). Wipes user data from `cards`, `lots`, `card_listings`, `lot_listings` while preserving the catalog and Cardmarket tables.

```bash
psql $DATABASE_URL -f scripts/wipe-user-data.sql
```

⚠️ **Destructive**. Read the file before running.

---

## 🔌 API endpoints (cron / authenticated)

Not CLI scripts — HTTP endpoints. But you'll trigger them manually for debugging, so here's the reference.

### `POST /api/prices/update` (cron)

The daily price refresh. Authenticated via `Authorization: Bearer $CRON_SECRET`. Pulls 200 oldest cards `for_sale`, looks up each via `cardmarket-pricing.ts`, updates `cm_price_*` columns.

```bash
# Manual trigger (production)
curl -X POST https://your-app.vercel.app/api/prices/update \
  -H "Authorization: Bearer $CRON_SECRET"

# Single card refresh (auth via Supabase session — used by the UI button)
curl -X POST "http://localhost:3000/api/prices/update?card_id=<uuid>" \
  --cookie "<your supabase session cookie>"
```

### `POST /api/backup/manual` (auth)

Triggered from the Options page UI. Dumps 8 user-data tables, gzips them, uploads to `manual-backups` bucket.

---

## 🔑 Environment variables reference

Every environment variable used across the app and scripts, and what it's for.

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
