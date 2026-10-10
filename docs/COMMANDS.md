# Commands

Every npm script, every script under `scripts/`, the Cardmarket scraper, the Vinted agent's Python commands and the showcase tooling: what each one does, what it reads and writes, and whether it is a tool you keep using or a one-shot you should not run again. The variables they read are in the table in [SETUP.md](SETUP.md#environment-variables); this page does not repeat it. Checked against the code on 2026-10-11.

## Contents

- [Conventions](#conventions)
- [npm scripts](#npm-scripts)
- [Development and checks](#development-and-checks)
- [Backups and snapshots](#backups-and-snapshots)
- [Catalog and card data](#catalog-and-card-data)
- [Cardmarket data](#cardmarket-data)
- [The Cardmarket scraper](#the-cardmarket-scraper)
- [Store events](#store-events)
- [PTCG tooling](#ptcg-tooling)
- [Generated assets](#generated-assets)
- [Diagnostics and benchmarks](#diagnostics-and-benchmarks)
- [Wiping user data](#wiping-user-data)
- [HTTP endpoints for schedulers](#http-endpoints-for-schedulers)
- [The Vinted agent](#the-vinted-agent)
- [Showcase tooling](#showcase-tooling)

## Conventions

- **Where to run.** From the repository root. `npm run <name> -- <arguments>` passes the arguments on to the script; the scripts without an npm alias run with `npx tsx scripts/<file>`. A few read `.env.local` or other files relative to the current directory, so do not start them from elsewhere.
- **Environment.** Every script that talks to Supabase reads `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`; the entries below name only the other variables they need. Some scripts also accept `SUPABASE_URL` in place of the public one.
- **They act on whatever project `.env.local` points to, and with the service role key, which bypasses row-level security.** Check which project that is before you run anything that writes or deletes.
- **Tests.** The tests that sit beside the scripts (`scripts/*.test.ts`, `scripts/store-events/lib/*.test.ts`) run with `npm test`.
- **Kinds.**
  - **Recurring**: runs on a schedule or as part of normal work.
  - **Occasional**: a current tool you reach for when the situation calls for it.
  - **One-shot**: written for one operation. Running it again is pointless or unsafe.
  - **Legacy**: superseded by another command. It is kept for the record and may need a fix before it works again.

## npm scripts

All 26 scripts of [`package.json`](../package.json), with what each one runs.

| Script | Runs | Kind | Details |
|---|---|---|---|
| `dev` | `next dev` | Recurring | [Development and checks](#development-and-checks) |
| `build` | `next build` | Recurring | [Development and checks](#development-and-checks) |
| `start` | `next start` | Recurring | [Development and checks](#development-and-checks) |
| `lint` | `eslint` | Recurring | [Development and checks](#development-and-checks) |
| `format` | `prettier --write .` | Occasional, see the warning | [Development and checks](#development-and-checks) |
| `format:check` | `prettier --check .` | Occasional | [Development and checks](#development-and-checks) |
| `typecheck` | `tsc --noEmit` | Recurring | [Development and checks](#development-and-checks) |
| `test` | `vitest run` | Recurring | [Development and checks](#development-and-checks) |
| `test:watch` | `vitest` | Recurring | [Development and checks](#development-and-checks) |
| `snapshot-catalog` | `tsx scripts/snapshot-catalog.ts` | Occasional | [`snapshot-catalog`](#snapshot-catalog) |
| `restore-catalog` | `tsx scripts/restore-catalog.ts` | Occasional | [`restore-catalog`](#restore-catalog) |
| `snapshot-cardmarket-index` | `tsx scripts/snapshot-cardmarket-index.ts` | Occasional | [`snapshot-cardmarket-index`](#snapshot-cardmarket-index) |
| `restore-cardmarket-index` | `tsx scripts/restore-cardmarket-index.ts` | Occasional | [`restore-cardmarket-index`](#restore-cardmarket-index) |
| `restore-cardmarket-expansions` | `tsx scripts/restore-cardmarket-expansions.ts` | Occasional | [`restore-cardmarket-expansions`](#restore-cardmarket-expansions) |
| `upload-cardmarket-dumps` | `tsx scripts/upload-cardmarket-dumps.ts` | Recurring | [`upload-cardmarket-dumps`](#upload-cardmarket-dumps) |
| `update-expansions` | `tsx scripts/update-cardmarket-expansions.ts` | Recurring, when a set is released | [`update-expansions`](#update-expansions) |
| `build-cardmarket-input` | `tsx scripts/build-cardmarket-input.ts` | Occasional | [`build-cardmarket-input`](#build-cardmarket-input) |
| `scrape-cm-expansion-names` | `tsx scripts/scrape-cardmarket-expansion-names.ts` | Legacy | [`scrape-cm-expansion-names`](#scrape-cm-expansion-names) |
| `scrape-cardmarket` | `tsx scripts/scrape-cardmarket-cards.ts` | Legacy | [`scrape-cardmarket`](#scrape-cardmarket) |
| `probe-cardmarket` | `tsx scripts/probe-cardmarket-expansion.ts` | Occasional, for debugging | [`probe-cardmarket`](#probe-cardmarket) |
| `scrape-events` | `tsx scripts/store-events/core.ts` | Recurring | [Store events](#store-events) |
| `reenrich-cards` | `tsx scripts/reenrich-existing-cards.ts` | Occasional | [`reenrich-cards`](#reenrich-cards) |
| `ptcg-digest` | `tsx scripts/ptcg-digest.ts` | Occasional | [`ptcg-digest`](#ptcg-digest) |
| `ptcg-bundle` | `tsx scripts/ptcg-bundle.ts` | Occasional | [`ptcg-bundle`](#ptcg-bundle) |
| `skill-zip` | `tsx scripts/skill-zip.ts` | Occasional | [`skill-zip`](#skill-zip) |
| `generate-icons` | `tsx scripts/generate-icons.ts` | Occasional | [`generate-icons`](#generate-icons) |

Scripts without an npm alias:

| File | Kind | Details |
|---|---|---|
| `scripts/scrape-limitlesstcg.ts` | Occasional | [`scrape-limitlesstcg.ts`](#scrape-limitlesstcgts) |
| `scripts/generate-pokemon-names.ts` | Occasional | [`generate-pokemon-names.ts`](#generate-pokemon-namests) |
| `scripts/generate-rescrape-input.ts` | Occasional | [`generate-rescrape-input.ts`](#generate-rescrape-inputts) |
| `scripts/parse-cardmarket-expansions.ts` | Legacy | [`parse-cardmarket-expansions.ts`](#parse-cardmarket-expansionsts) |
| `scripts/fix-cardmarket-set-prefix.ts` | One-shot | [`fix-cardmarket-set-prefix.ts`](#fix-cardmarket-set-prefixts) |
| `scripts/recommend-scrape-targets.ts` | Legacy | [`recommend-scrape-targets.ts`](#recommend-scrape-targetsts) |
| `scripts/debug-scraper-fetch.ts` | Occasional, for debugging | [`debug-scraper-fetch.ts`](#debug-scraper-fetchts) |
| `scripts/check-supabase-state.ts` | Occasional | [`check-supabase-state.ts`](#check-supabase-statets) |
| `scripts/inspect-ocr.ts` | Occasional, for debugging | [`inspect-ocr.ts`](#inspect-ocrts) |
| `scripts/bench-multi-model.ts` | Occasional | [`bench-multi-model.ts`](#bench-multi-modelts) |
| `scripts/bench-multilang.ts` | Occasional | [`bench-multilang.ts`](#bench-multilangts) |
| `scripts/measure-gemini-prompt-tokens.ts` | Occasional | [`measure-gemini-prompt-tokens.ts`](#measure-gemini-prompt-tokensts) |
| `scripts/probe-tcgdex-fails.ts` | One-shot | [`probe-tcgdex-fails.ts`](#probe-tcgdex-failsts) |
| `scripts/backup/rotate.sh` | Recurring, run by the workflow | [`rotate.sh`](#rotatesh) |
| `scripts/wipe-user-data.sql` | One-shot, destructive | [Wiping user data](#wiping-user-data) |

`scripts/data/` holds one tracked file, `cardmarket-modern-expansions.json` (281 curated Cardmarket slugs, read by [`scrape-cardmarket`](#scrape-cardmarket)), and git-ignored leftovers: the PTCG card cache, 403 screenshots and the bad-slug list.

## Development and checks

| Command | What it does |
|---|---|
| `npm run dev` | `next dev` on `http://localhost:3000`. It binds to all interfaces, so a phone on the same network can reach it at your computer's LAN address. For the phone's camera, `npx next dev --experimental-https` serves a self-signed HTTPS certificate ([SETUP.md](SETUP.md#run-the-app)). `-- -p <port>` changes the port. |
| `npm run build` | `next build`: the production build, with a type check. Run it as well when a change touches routing, server components or configuration. |
| `npm start` | `next start`: serves the `.next` build. Run `build` first. |
| `npm run typecheck` | `tsc --noEmit`. It leaves out `scrapers/`, which has its own `tsconfig.json`. A translation key missing from `messages/en.json` fails here and nowhere else. |
| `npm run lint` | `eslint` over the repository, with the flat config in `eslint.config.mjs`. |
| `npm test` | `vitest run`: 156 test files and 1,401 tests on 2026-10-11, in happy-dom. It also runs the tests beside the scripts, the Cardmarket scraper's parser tests (`scrapers/cardmarket/src/scrape.test.ts`) and `scripts/skill-zip.test.ts`, which fails when `.claude/skills/ptcg-coach.zip` is stale ([`skill-zip`](#skill-zip)). |
| `npm run test:watch` | `vitest` in watch mode. |
| `npm run format`, `npm run format:check` | `prettier --write .` and `prettier --check .`. The codebase is not Prettier-clean: `format` would rewrite hundreds of files and bury your change, and `format:check` reports most files. Match the surrounding style by hand instead ([CONTRIBUTING.md](CONTRIBUTING.md#ground-rules)). |

No CI runs any of these ([TECH_DEBT.md](TECH_DEBT.md#no-ci)). [CONTRIBUTING.md](CONTRIBUTING.md#running-the-checks) says what to run before a push, including the agent's tests ([The Vinted agent](#the-vinted-agent)).

## Backups and snapshots

Reference data (the card catalog and the Cardmarket index) is slow to rebuild, so snapshots of it are committed under [`backups/`](../backups/README.md). User data (cards, lots, listings) is backed up outside git. [backups/README.md](../backups/README.md) has the procedures, the snapshot dates and row counts, and [SUPABASE.md](SUPABASE.md#backups-and-what-they-cover) says what each backup covers. The restore order for a fresh project is in [SETUP.md](SETUP.md#catalog-and-pricing-data).

The three restore scripts ask "Continue? [y/N]" before they touch a table. `SKIP_CONFIRM=1` skips the prompt.

### `snapshot-catalog`

Kind: **Occasional**. Run it after a full LimitlessTCG crawl, then commit `backups/`.

```bash
npm run snapshot-catalog
```

- Reads `tcg_catalog` (pages of 1,000, ordered by `id`) and `rarity_ranks`.
- Writes `backups/tcg_catalog.jsonl.gz` (one JSON row per line, gzipped) and `backups/rarity_ranks.json`. The names are fixed and the files are overwritten; git keeps the history.

### `restore-catalog`

Kind: **Occasional** (a fresh database, or a recovery).

```bash
npm run restore-catalog
SKIP_CONFIRM=1 npm run restore-catalog     # no prompt
```

- Reads `backups/tcg_catalog.jsonl.gz` and `backups/rarity_ranks.json`. It takes no path argument: the files are always those two.
- Empties `tcg_catalog` (through the RPC `truncate_tcg_catalog`, falling back to a plain delete), inserts the rows in chunks of 500, then deletes and re-inserts `rarity_ranks`.
- No migration creates `truncate_tcg_catalog`, so on a project built from the migrations the script uses its fallback: it deletes every row (`id is not null`), which is slower on 52,000 rows but works. `rarity_ranks` is emptied the same way before its 10 rows go back in. Until 2026-10-11 both deletes compared a uuid with `0` and an enum with `''`, and failed.

### `snapshot-cardmarket-index`

Kind: **Occasional**. Run it after every Cardmarket scrape, so the scraping time and the BrightData credits are not lost.

```bash
npm run snapshot-cardmarket-index
```

- Reads `cardmarket_card_index` (pages of 1,000, ordered by `id_product`) and `cardmarket_expansions` (one query, 741 rows).
- Writes `backups/cardmarket_card_index.jsonl.gz` and `backups/cardmarket_expansions.jsonl.gz`. One command writes both; there is none for the expansions alone. The expansions matter because `set_prefix`, which only the scraper fills, is what costs credits to rebuild.

### `restore-cardmarket-index`

Kind: **Occasional**.

```bash
npm run restore-cardmarket-index
```

- Reads `backups/cardmarket_card_index.jsonl.gz`.
- Deletes every row of `cardmarket_card_index`, then inserts the snapshot in chunks of 500.
- Each row references a product and an expansion by foreign key, so run `upload-cardmarket-dumps` and `restore-cardmarket-expansions` first; otherwise the insert fails with a foreign key violation.

### `restore-cardmarket-expansions`

Kind: **Occasional**.

```bash
npm run restore-cardmarket-expansions
```

- Reads `backups/cardmarket_expansions.jsonl.gz`.
- Upserts `cardmarket_expansions` in chunks of 200, overwriting `name`, `name_normalized`, `name_en`, `name_ja` and `set_prefix` on rows that exist. It upserts rather than deletes because `cardmarket_products` references the expansions.
- It exists because the nightly upload writes names only: it preserves a `set_prefix` that is already there but cannot recreate it on a fresh database.

### User-data backups

Both mechanisms cover the same eight tables (`cards`, `lots`, `card_listings`, `lot_listings`, `user_profiles`, `config`, `ocr_usage_log`, `stock_value_snapshots`) and nothing else: no Items, PTCG data, price history, Vinted bot tables or photos.

- **Manual backup.** The Options page calls `POST /api/backup/manual`, which reads the eight tables (paging past the 1,000-row cap), gzips them as `{ version, created_at, tables }` and stores the file in the private `manual-backups` bucket as `iris-YYYY-MM-DD-HHMMSS.json.gz`. `GET /api/backup/manual` lists the 100 newest, `GET /api/backup/manual/<filename>` returns a signed URL valid for one hour, `DELETE` removes a file. Nothing rotates them, and there is no restore script for this format ([backups/README.md](../backups/README.md#manual-backup-from-the-options-page)).
- **Scheduled backup.** [`backup.yml`](../.github/workflows/backup.yml) runs `pg_dump --data-only` on the same tables every day at 03:00 UTC and publishes the result as a GitHub pre-release; [`rotate.sh`](#rotatesh) prunes old ones. As of 2026-10-11 it does not produce a usable backup: it reports success while uploading empty files, and fixing that would publish user data on a public repository ([TECH_DEBT.md](TECH_DEBT.md#the-scheduled-database-backup-uploads-empty-files-and-reports-success)). Restoring a release, once the job works, is in [backups/README.md](../backups/README.md#scheduled-backup-from-github-actions).

### `rotate.sh`

Kind: **Recurring**, but only by the backup workflow. Do not run it by hand.

```bash
bash scripts/backup/rotate.sh      # needs the gh CLI, authenticated for the repository
```

Lists the repository's releases (`gh release list --limit 1000`) and deletes the older ones with `gh release delete --yes --cleanup-tag`, keeping the latest 30 `backup-daily-*`, 12 `backup-weekly-*` and 12 `backup-monthly-*` tags. Tags are sorted by name, and the names carry the date. It stops on the first error (`set -euo pipefail`). It acts on whichever repository `gh` resolves from the current directory.

## Catalog and card data

### `scrape-limitlesstcg.ts`

Kind: **Occasional**. It bootstrapped `tcg_catalog` from [LimitlessTCG](https://limitlesstcg.com). The committed snapshot is the fast path ([SETUP.md](SETUP.md#catalog-and-pricing-data)), so you rarely need it.

```bash
npx tsx scripts/scrape-limitlesstcg.ts                          # probe: one set (SV11W, JP), nothing written
SET=BW5n PROBE_LANG=jp npx tsx scripts/scrape-limitlesstcg.ts   # probe another set
MODE=full npx tsx scripts/scrape-limitlesstcg.ts                # the real crawl: every set, upserted into tcg_catalog
MODE=full LANGUAGES=jp,en ONLY_SETS=SV11W,SV10 npx tsx scripts/scrape-limitlesstcg.ts    # a subset
```

The default mode is `probe`: it fetches one set, prints a few parsed cards and statistics, checks that the first image URL answers and lists the language's sets. It needs no Supabase variables and writes nothing. Only `MODE=full` writes.

| Variable | Default | Effect |
|---|---|---|
| `MODE` | `probe` | `full` crawls and writes. |
| `SET`, `PROBE_LANG` | `SV11W`, `jp` | The set the probe fetches. |
| `LANGUAGES` | `jp,en,fr` | The languages to crawl. Only these three are mapped: German, Italian, Spanish and Portuguese were dropped, and Korean and Chinese do not exist on the site. |
| `ONLY_SETS` | all | Comma-separated set codes to keep. |
| `SCRAPE_ILLUSTRATOR` | off | `1` also fetches each card's own page for the illustrator: one request per card, five at a time, about 3 hours for the whole catalog by the script's own estimate. |
| `FORCE_RESCRAPE` | off | `1` ignores the resume check, which only exists when `SCRAPE_ILLUSTRATOR=1`. |
| `INSECURE_HTTPS` | off | `1` skips TLS certificate verification, for networks that inject their own certificate (the symptom is `UNABLE_TO_VERIFY_LEAF_SIGNATURE`). |

- Reads `limitlesstcg.com` (`/cards/<lang>` for the set list, `/cards/<lang>/<set>?display=list` for each set, 500 ms between requests) and `.env.local`, which it parses itself.
- Writes `tcg_catalog`, upserting on `(set_code, set_number, language)` in batches of 100. It never deletes, so a set removed upstream stays. `pokemon_number` stays null, and rarities it does not know are stored as `OTHER` and listed at the end of the run.
- Without `SCRAPE_ILLUSTRATOR`, a re-run crawls every set again, which the upsert makes harmless. With it, sets whose rows all have an illustrator are skipped, so a crashed run resumes where it stopped.
- A base crawl takes about 12 minutes ([backups/README.md](../backups/README.md#refreshing-a-snapshot)). Afterwards run `npm run snapshot-catalog` and commit `backups/`.

### `reenrich-cards`

Kind: **Occasional**. Run it after `update-expansions` has imported a set whose cards you scanned earlier.

```bash
npm run reenrich-cards
```

- Reads the `cards` rows whose `cardmarket_id` is null (one request, so at most 1,000 per run), then `cardmarket_expansions`, `cardmarket_card_index` and `cardmarket_products`.
- For each card whose set name and number resolve to an index row, it writes `cards.cardmarket_id`, `card_name`, `set_name` (the English name) and `tcg_image_url` (`/api/cm-img/<id>?prefix=<set_prefix>`, or empty when the expansion has no prefix).
- It never touches a card that already has a `cardmarket_id`, runs no enrichment strategy, and writes no price, `cardmarket_url` or `set_prefix`. Safe to repeat. It prints a summary: resolved, skipped for missing set information, skipped as not found, failed.

## Cardmarket data

How the pieces fit together is in [CARDMARKET_MAPPING.md](CARDMARKET_MAPPING.md) and [ARCHITECTURE.md](ARCHITECTURE.md#data-flow-pricing-pipeline). The committed `cardmarket_expansions.json` (741 entries, id to French name) gates the nightly import: products of an expansion that is not in it are dropped. Which command for which situation:

- Prices stale: nothing to do, the nightly workflow runs [`upload-cardmarket-dumps`](#upload-cardmarket-dumps). Run it by hand to refresh now.
- A set was just released: [`update-expansions`](#update-expansions).
- Some expansions have no index rows or no `set_prefix`: `update-expansions -- --rescrape-missing`, or [`generate-rescrape-input.ts`](#generate-rescrape-inputts) and the [scraper](#the-cardmarket-scraper).
- Collector numbers of a wheel-type promo set are wrong: [`scrape-cardmarket`](#scrape-cardmarket).

The scripts after `generate-rescrape-input.ts` are legacy or debugging tools.

### `upload-cardmarket-dumps`

The nightly price sync. Kind: **Recurring** (`cardmarket-prices.yml`, 01:07 UTC).

```bash
npm run upload-cardmarket-dumps               # download the dumps from Cardmarket's public S3 bucket (no authentication)
npm run upload-cardmarket-dumps -- --local    # read products_singles_6.json and price_guide_6.json from the repository root instead (git-ignored)
```

- Reads `cardmarket_expansions.json` (always the committed copy), `products_singles_6.json` and `price_guide_6.json`. The sealed-product dump is ignored.
- Writes, as upserts in chunks of 1,000: `cardmarket_expansions` (`id_expansion`, `name`, `name_normalized` only, so `set_prefix`, `name_en` and `name_ja` are left alone), `cardmarket_products` and `cardmarket_pricing`.
- Drops the products whose expansion is not in the JSON, with a warning that lists up to eight of the newest unknown ids. That is the signal to run `update-expansions`.
- It takes about 30 seconds.

### `update-expansions`

Teaches the app a newly released set. Kind: **Recurring** (a few times a year).

```bash
npm run update-expansions                                # the whole flow
npm run update-expansions -- --dry-run                   # report the new sets, write nothing
npm run update-expansions -- --no-scrape                 # everything except the gallery scrape
npm run update-expansions -- --rescrape-missing=6500     # also scrape known expansions with no set_prefix, from this id up
```

A new set has no expansion row, no products, no prices and no `set_prefix` until this runs. In order, it:

1. Fetches Cardmarket's French, English and Japanese expansion lists through BrightData.
2. Diffs them against the committed `cardmarket_expansions.json`.
3. Adds the new ids to that file. **Commit it**, or the nightly import keeps dropping the new products.
4. Upserts every expansion row with its three names (`set_prefix` untouched).
5. Downloads the dumps and upserts products and prices for the new expansions only.
6. Writes `scrapers/cardmarket/storage/key_value_stores/default/INPUT.json` (French-localised duplicates and sealed-product wrappers skipped) and runs [the scraper](#the-cardmarket-scraper) on it, which fills `cardmarket_card_index` and `set_prefix`. It runs the scraper only if `scrapers/cardmarket/node_modules` exists, so run `npm install` there first.
7. Prints a check per new set (prefix present, index rows) and the next steps: commit the JSON, `npm run snapshot-cardmarket-index`, and `npm run reenrich-cards` if cards of the set were scanned before.

Needs `BRIGHTDATA_TOKEN` (and `BRIGHTDATA_ZONE`, default `iris`); `--dry-run` needs it too, because it still reads the expansion lists. **As of 2026-10-11 it is blocked**: the BrightData token expired on 2026-10-05 ([TECH_DEBT.md](TECH_DEBT.md#new-sets-arent-imported-the-brightdata-token-expired), [scrapers/cardmarket/README.md](../scrapers/cardmarket/README.md#brightdata-token)). Without a new set, the command still refreshes the names of every expansion.

### `build-cardmarket-input`

Kind: **Occasional**. Builds the scraper's input for a full backfill of every known expansion.

```bash
npm run build-cardmarket-input
cp cardmarket-input.json scrapers/cardmarket/storage/key_value_stores/default/INPUT.json
```

- Reads `cardmarket_expansions.json`. No database access.
- Writes `cardmarket-input.json` at the repository root (git-ignored), with `skipExisting: true`, `concurrency: 3` and `perPage: 30`.
- Its slugs come from the French names, while Cardmarket's URLs use the English ones; `generate-rescrape-input.ts` and `update-expansions` build the slugs from the English names.

### `generate-rescrape-input.ts`

Kind: **Occasional**. Builds the scraper's input for the expansions that have no `set_prefix` yet.

```bash
npx tsx scripts/generate-rescrape-input.ts                  # every expansion with a null set_prefix
npx tsx scripts/generate-rescrape-input.ts --min-id=5200    # only id_expansion >= 5200
```

- Reads `cardmarket_expansions` where `set_prefix` is null. It takes `.env.local` from the current directory, so run it from the repository root.
- Writes `scrapers/cardmarket/.actor/RESCRAPE_INPUT.json` (git-ignored). Slugs come from the English names, because Cardmarket's URLs use them even on the French site; French-localised duplicates and sealed-product wrappers are skipped. Copy the file to `scrapers/cardmarket/storage/key_value_stores/default/INPUT.json` to feed [the scraper](#the-cardmarket-scraper).
- The "next steps" it prints at the end mention Apify commands that no longer apply; follow the scraper's README instead.

### `scrape-cm-expansion-names`

Kind: **Legacy**. The fourth step of `update-expansions` does the same.

```bash
npm run scrape-cm-expansion-names
```

- Fetches Cardmarket's English and Japanese expansion dropdowns through BrightData (needs `BRIGHTDATA_TOKEN`).
- Updates `name_en` and `name_ja` on the existing `cardmarket_expansions` rows, one update per id, no insert. It does not touch `cardmarket_expansions.json`. Idempotent.

### `parse-cardmarket-expansions.ts`

Kind: **Legacy**. It produced `cardmarket_expansions.json` from a saved copy of Cardmarket's French expansion dropdown; `update-expansions` now reads the dropdown itself and extends the JSON.

```bash
npx tsx scripts/parse-cardmarket-expansions.ts <input.html> <output.json>
```

Reads the saved HTML (its `<option value="id">name</option>` pairs, skipping id 0) and writes `{ "id": "name" }` JSON to the path you give. Both arguments are required. No database, no environment.

### `fix-cardmarket-set-prefix.ts`

Kind: **One-shot**. It backfilled `set_prefix` for expansions whose slugs did not follow the `-PREFIX<number>` convention; the scraper writes the prefix itself now.

```bash
npx tsx scripts/fix-cardmarket-set-prefix.ts
```

- Reads the `cardmarket_expansions` rows with a null `set_prefix` and, for each, one `url_path` from `cardmarket_card_index`. It fetches that product page straight from cardmarket.com (browser headers, no BrightData, three at a time, 15 s timeout) and parses the product image URL, which carries the prefix. It takes `.env.local` from the current directory.
- Writes `cardmarket_expansions.set_prefix`.
- Reports why an expansion failed: never scraped (no index rows), no `url_path`, an HTTP error, or no image URL in the page. Cardmarket may answer 403. A comment in the script mentions `BRIGHTDATA_PROXY_URL`; the code does not read it.

### `scrape-cardmarket`

The Playwright gallery scraper. Kind: **Legacy**, a fallback: the [BrightData scraper](#the-cardmarket-scraper) replaced it as the way to fill `cardmarket_card_index`. Keep it for the wheel-type promo sets (Battle Party Set, Void Blast) whose collector numbers have no deterministic order ([CARDMARKET_MAPPING.md](CARDMARKET_MAPPING.md)).

```bash
npm run scrape-cardmarket -- Battle-Party-Set         # one expansion, by its Cardmarket slug
npm run scrape-cardmarket -- --modern                 # the 281 entries of scripts/data/cardmarket-modern-expansions.json
npm run scrape-cardmarket -- --since=5500             # the entries of that list with id_expansion >= 5500
npm run scrape-cardmarket -- --all                    # every cardmarket_expansions row (curated slug when known, otherwise derived from the name)
npm run scrape-cardmarket -- --force --modern         # also re-scrape expansions already in the index
npm run scrape-cardmarket -- --dry-run Crimson-Haze   # scrape and print, write nothing
```

The script's header comment writes `--since 5500`; the code only understands `--since=5500`. Do not run `--all`: it is hours of requests to Cloudflare-protected pages.

- Reads `scripts/data/cardmarket-modern-expansions.json`, `cardmarket_expansions` (for `--all`) and `cardmarket_card_index` (to skip the expansions that already have rows, unless `--force`). With `--dry-run` it touches no database, so the slugs must be in the modern list.
- Writes `cardmarket_card_index`, upserting on `id_product` with `url_path` and `language` set to `fr`; products missing from `cardmarket_products` are dropped with a notice. On a 403 it saves `scripts/data/403-<timestamp>.png`, and it lists unusable slugs in `scripts/data/cardmarket-bad-slugs.json` (both git-ignored).
- Needs `rebrowser-playwright` with the system Chrome; `BROWSER_CHANNEL=chromium` uses the bundled Chromium instead.
- Pacing: a pre-flight request first (a 403 there aborts the run), 15 s between pages, 60 s between expansions, a cooldown of 3 to 5 minutes every 25 expansions, retries with growing cooldowns on HTTP 429, a kill switch at two 429s, and an abort after three bad slugs in a row. Run it only from a residential IP, and after a ban wait hours, not minutes.

### `recommend-scrape-targets.ts`

Kind: **Legacy**: it plans runs of the Playwright scraper.

```bash
npx tsx scripts/recommend-scrape-targets.ts
```

- Reads `cards.set_name`, `cardmarket_expansions` and `cardmarket_card_index.id_expansion` through the REST API with the service role key. Each table is fetched in one request, so under Supabase's 1,000-row cap it sees only the first 1,000 rows of each, and its "already scraped" flags are unreliable.
- Matches each distinct set name to an expansion (normalised name, then sorted tokens, with a few French hints) and prints a matched list, an unmatched list with candidates, and a `npm run scrape-cardmarket -- <slugs>` command for the sets not yet in the index. Writes nothing.

### `probe-cardmarket`

Kind: **Occasional**, for debugging. See what Cardmarket serves before you touch the scraper's parser.

```bash
npm run probe-cardmarket -- Crimson-Haze
npm run probe-cardmarket -- Crimson-Haze/Bloodmoon-Ursaluna-ex-V1-sv5a052    # a product page works too
```

Opens `https://www.cardmarket.com/fr/Pokemon/Products/Singles/<slug>?idRarity=0` in headless Chromium through the `playwright` package (install the browser once with `node node_modules/playwright/cli.js install chromium`), waits 3 seconds, and writes the page to `cardmarket-probe-<slug>.html` in the current directory (git-ignored; `/` in the slug becomes `__`). It prints the HTTP status, the page title and the number of product links, and warns when Cloudflare answers with an interstitial. No environment, no database.

### `debug-scraper-fetch.ts`

Kind: **Occasional**, for debugging. Use it when the scraper returns no cards for a set that has some.

```bash
npx tsx scripts/debug-scraper-fetch.ts 5328 Pokemon-Card-151     # <idExpansion> <slug>
```

- Fetches one expansion page twice through BrightData: a minimal URL like a browser's, and the full URL the scraper builds. Needs `BRIGHTDATA_TOKEN` (zone default `iris`) and takes `.env.local` from the current directory.
- Reports the size, the number of `galleryBox` markers, no-result and redirect markers and CAPTCHA-looking text, and saves both pages to `/tmp/cm-debug-<id>-minimal.html` and `/tmp/cm-debug-<id>-full.html`. The path is hard-coded: on Windows it is `\tmp` on the current drive, which must exist.

## The Cardmarket scraper

[`scrapers/cardmarket/`](../scrapers/cardmarket/README.md) is a standalone package with its own `package.json`, lockfile and tests. It reads Cardmarket's gallery pages through BrightData Web Unlocker, one expansion at a time. Kind: **Occasional**; `update-expansions` normally launches it.

```bash
cd scrapers/cardmarket
npm install                       # the root npm install does not cover this folder
npx tsx src/main.ts               # the same as npm start
npm test                          # vitest run: the parser tests (the root npm test runs them too)
```

- **Input.** The scraper takes its input from `storage/key_value_stores/default/INPUT.json` in its own folder (git-ignored). Produce it with `update-expansions` (new sets), [`generate-rescrape-input.ts`](#generate-rescrape-inputts) (expansions without a prefix), [`build-cardmarket-input`](#build-cardmarket-input) (everything), or by hand for one expansion:

  ```json
  { "expansions": [{ "idExpansion": 1521, "name": "Vigueur Spectrale", "slug": "Vigueur-Spectrale" }], "skipExisting": false, "concurrency": 1 }
  ```

  The fields are `expansions` (each with `idExpansion`, `name`, `slug`), `skipExisting` (default `true`: skip expansions that already have index rows), `concurrency` (default 3, clamped to 1 to 10) and `perPage` (default 30, clamped to 30 to 100).
- **Environment.** `BRIGHTDATA_TOKEN`, `BRIGHTDATA_ZONE`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, from `scrapers/cardmarket/.env` when run by hand. Set the zone explicitly: unset, the scraper uses `web_unlocker1` while the root scripts use `iris`. See [SETUP.md](SETUP.md#script-and-scraper-variables).
- **Writes.** `cardmarket_card_index` (`id_product`, `id_expansion`, `set_number`, `url_variant`, `language`, `url_path`) and `cardmarket_expansions.set_prefix`, pausing 0.5 to 1.5 seconds between pages.
- **Afterwards.** `npm run snapshot-cardmarket-index` from the repository root, then commit `backups/`.
- **Cost and failures.** About $4.50 for a full backfill; a single new set costs a few cents. The failure modes (foreign key on `cardmarket_card_index_id_product_fkey`, BrightData rejecting the token) are in the [scraper's README](../scrapers/cardmarket/README.md#known-failure-modes).

## Store events

Kind: **Recurring**. [`store-events.yml`](../.github/workflows/store-events.yml) runs it every 30 minutes.

```bash
npm run scrape-events                  # scrape every shop and write store_events
npm run scrape-events -- --dry-run     # scrape and print the next dated events; writes nothing and needs no Supabase variables
npm run scrape-events -- --no-browser  # skip the five shops that need a browser (no Chromium needed)
```

- Reads the nine shops' event pages. The list is [`scripts/store-events/sources.ts`](../scripts/store-events/sources.ts), joined with the shop directory in `lib/data/event-sources.ts`; each shop has an extractor in `scripts/store-events/extractors/`, and `lib/` holds the HTTP and browser helpers, the French date parser and the event classifier. Five shops render their events client-side and need headless Chromium; install it once with `node node_modules/playwright/cli.js install chromium` (a plain `npx playwright` can resolve to the copy shipped inside `rebrowser-playwright`, which installs the wrong build).
- Writes `store_events`. For each source that succeeds, the engine deletes that source's rows and upserts the new ones on `external_id`; when a source fails, its existing rows are left alone, so a shop that is briefly down does not lose its calendar.
- To add a shop, see [ARCHITECTURE.md](ARCHITECTURE.md#data-flow-store-events). Two sources are stale at the moment ([TECH_DEBT.md](TECH_DEBT.md#two-event-sources-are-stale)).

## PTCG tooling

The Pokémon TCG Live parser lives in `lib/ptcg/`; these three scripts are its command-line side. By convention battle logs are kept in `games/`, which is git-ignored. Output messages are in French.

### `ptcg-digest`

Kind: **Occasional** (once per game you analyse with the coach skill).

```bash
npm run ptcg-digest -- <log.txt>               # writes <log>.digest.json next to the log
npm run ptcg-digest -- <log.txt> <digest.json>
```

- Standalone: no database, no session. Parses the exported log, prints the players, the result, the prizes and the turn count, and lists the lines it did not recognise. If the reconstruction fails the log's own damage checks it **stops without writing anything**.
- Resolves the cards through TCGdex (network) and caches them in `scripts/data/ptcg-cards-cache.json` (git-ignored), so only new cards are fetched.
- Writes the digest JSON, which you paste into the `ptcg-coach` skill ([CONTRIBUTING.md](CONTRIBUTING.md#the-ptcg-coach-skill)).

### `ptcg-bundle`

Kind: **Occasional**.

```bash
npm run ptcg-bundle -- <log.txt> <analysis.json> [bundle.json]
```

- Merges an analysis with the reconstruction of its log into one self-contained file the app's import accepts. It runs the same validation as the import route (identity strict, parser quality lenient) and writes no bundle if it fails.
- Resolves cards like the digest, with the same cache (updated even when the bundle is then rejected). The game's date comes from a `YYYY-MM-DD` in the log's file name; without one the game is dated now, with a warning.
- Writes `<log>.bundle.json` unless you give another path.
- It expects the bare `analysis` object, while the coach skill now returns `{ raw, analysis, playedAt }` ([TECH_DEBT.md](TECH_DEBT.md#the-coachs-documentation-points-to-a-removed-page)).

### `skill-zip`

Kind: **Occasional**. Run it after every edit under `.claude/skills/ptcg-coach/`, including `references/profile.md`, which the coach rewrites after each debrief. Commit the zip with the change.

```bash
npm run skill-zip
```

- Reads `.claude/skills/ptcg-coach/` and packs it into `.claude/skills/ptcg-coach.zip`, the file claude.ai asks for. The archive is deterministic (fixed timestamps, sorted entries), so `scripts/skill-zip.test.ts` rebuilds it and compares it byte for byte: a stale zip fails `npm test`.
- It skips `references/typhlosion-playbook.md`: that file is git-ignored because it condenses a paid guide, and the zip is committed to a public repository.
- Prints the file count, the size and a SHA-256 prefix. The paths come from the current directory, so use the npm script from the repository root.

## Generated assets

### `generate-icons`

Kind: **Occasional**. Run it after changing the logo, then commit the three PNGs.

```bash
npm run generate-icons
```

Reads `public/logo.png` and writes `public/icons/icon-192.png` and `icon-512.png` (transparent background) and `icon-512-maskable.png`: the logo scaled into the central 80% of a 512 px canvas filled with `#111110`, for Android's adaptive icons. It uses `sharp` and needs no environment.

### `generate-pokemon-names.ts`

Kind: **Occasional** (every few years, when a generation adds species).

```bash
npx tsx scripts/generate-pokemon-names.ts
```

- Reads PokéAPI (`pokemon-species/1` to `1025`, 20 requests in flight). No environment.
- Writes `lib/data/pokemon-names.json`: the French, English and Japanese name of each species, keyed by national dex number. `/api/ocr` uses it to overwrite the names Gemini gets wrong. The whole file is replaced.
- A species that fails to download is left out and only counted in the summary, so run it again if the failure count is not 0. To cover new species, raise `TOTAL_POKEMON` at the top of the script first.

## Diagnostics and benchmarks

### `check-supabase-state.ts`

Kind: **Occasional**, and partly out of date.

```bash
npx tsx scripts/check-supabase-state.ts
```

- Counts the rows of 12 tables (`user_profiles`, `cards`, `lots`, `card_listings`, `lot_listings`, `tcg_catalog`, `ocr_usage_log`, `stock_value_snapshots`, `cardmarket_expansions`, `cardmarket_products`, `cardmarket_pricing`, `cardmarket_card_index`) with exact counts, and flags the ones that do not exist. The schema has 33 tables, so it checks 12 of them. Writes nothing.
- Its "Cardmarket scrape readiness" block says the dumps are loaded when there are more than 60,000 products. When the index has any row it always prints "Index partial", counts the indexed expansions from the first 1,000 rows only, and suggests `npm run scrape-cardmarket -- --modern`, which is outdated advice. Prefer the queries in [SETUP.md](SETUP.md#catalog-and-pricing-data).

### `inspect-ocr.ts`

Kind: **Occasional**, for debugging.

```bash
npx tsx scripts/inspect-ocr.ts <path/to/photo.jpg>
```

Resizes the photo (at most 1600 px, JPEG quality 85, with `sharp`), sends it to Google Cloud Vision's `DOCUMENT_TEXT_DETECTION` with Japanese and English hints, and prints the full text, then the words in the lower 30% of the card (where the set code and number sit) with their normalised coordinates. It calls Vision only, not Gemini, and needs `GOOGLE_VISION_API_KEY`. It writes nothing.

### `bench-multi-model.ts`

Kind: **Occasional**. Run it when you consider changing the Gemini model or the prompt.

```bash
npx tsx scripts/bench-multi-model.ts
```

- Needs `GEMINI_API_KEY` and photos in `cards_assets/` (git-ignored, filled by you). It takes the first five `.jpg` files in name order; a file name such as `bw4_044_r.jpg` (`<set>_<number>_<x>.jpg`) is the ground truth.
- Sends them to four models (`gemini-3-flash-preview`, `gemini-3.1-flash-lite-preview`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`) with the production prompt and schema imported from `lib/api/gemini-vision.ts`: 20 paid calls, 4.5 seconds apart.
- Prints a result per photo and a Markdown summary (set and number accuracy, tokens, cost in euros, latency) plus the projected cost of 100 scans. It writes no file.

### `bench-multilang.ts`

Kind: **Occasional**.

```bash
npx tsx scripts/bench-multilang.ts
```

- Needs `GEMINI_API_KEY`, the Supabase variables and photos in `cards_assets/`. It sends every `.jpg` there to the pinned model, one paid call each, 4.5 seconds apart.
- Looks each answer up in `tcg_catalog` (exact set code, then a normalised one) and prints, per language Gemini detected, how many photos hit the catalog, followed by the lookups that failed and the total cost. It writes nothing.

### `measure-gemini-prompt-tokens.ts`

Kind: **Occasional**. Run it after editing `BASE_PROMPT` or the response schema.

```bash
npx tsx scripts/measure-gemini-prompt-tokens.ts
```

Reads `BASE_PROMPT` out of `lib/api/gemini-vision.ts` and makes three Gemini calls (two `countTokens`, one `generateContent` with a 1-pixel image) to work out what the prompt and schema cost. It prints a recommended `PROMPT_TOKEN_ESTIMATE`; copy it into the constant of the same name in `lib/api/gemini-vision.ts` by hand (it is 1465 today). Needs `GEMINI_API_KEY`; takes `.env.local` from the current directory. The header comment says `bun run`, but `tsx` works as well.

### `probe-tcgdex-fails.ts`

Kind: **One-shot**. It checked a fixed list of 14 cards (French, English, Japanese, Korean and Chinese) that had missed the local catalog in an earlier multilingual benchmark, to see whether TCGdex's live API would have found them.

```bash
npx tsx scripts/probe-tcgdex-fails.ts
```

Calls `api.tcgdex.net/v2` with several subseries spellings per card and prints which ones answer. No environment, no database. The list is hard-coded in the script, so it tells you nothing about your own data.

## Wiping user data

### `wipe-user-data.sql`

Kind: **One-shot**, destructive. Written on 2026-05-07 for the first real import.

```bash
psql "<connection string>" -f scripts/wipe-user-data.sql     # or paste the file into the Supabase SQL editor
```

In one transaction it runs `truncate table cards, lots, card_listings, lot_listings restart identity cascade`, checks that the four tables are empty, and prints the row counts of `tcg_catalog`, `rarity_ranks`, `user_profiles` and `config`.

- `cascade` also empties every table that has a foreign key to `cards` or `lots`: `price_history`, `vinted_post_jobs`, `vinted_queue` and `ocr_usage_log`. The script predates them, so its header does not say so.
- It leaves the catalog, the Cardmarket tables, Items, the PTCG tables, `audit_logs`, `stock_value_snapshots` and the auth users alone, and it does not touch Storage: empty the photo buckets (`card-photos`, `lot-photos`, and `other-item-photos` if you cleared Items) yourself.
- There is no undo. Take a manual backup first ([User-data backups](#user-data-backups)). For a clean slate on a new project, see [SUPABASE.md](SUPABASE.md#reset-from-scratch).

## HTTP endpoints for schedulers

These are route handlers, not scripts, but you trigger them by hand when debugging. The 35 route handlers are listed in [ARCHITECTURE.md](ARCHITECTURE.md#app).

| Endpoint | Auth | Called by |
|---|---|---|
| `GET` or `POST /api/prices/update` | `Authorization: Bearer $CRON_SECRET`, or a signed-in session | Vercel Cron (08:00, 14:00 and 20:00 UTC, with `?limit=700`), and the "refresh all prices" loop in Options |
| `GET` or `POST /api/prices/update?card_id=<uuid>` | a signed-in session | `RefreshPriceButton` |
| `GET` or `POST /api/prices/snapshot` | the bearer secret only | Vercel Cron, 23:55 UTC |
| `POST /api/backup/manual` and its list, download and delete routes | a signed-in session | the Options page ([User-data backups](#user-data-backups)) |

**`/api/prices/update`, bulk mode.** It picks the cards in `for_sale`, `pokedex` or `collection` (sold and traded cards are final), oldest `cm_updated_at` first and never-priced first, and prices them ten at a time. Parameters:

- `limit`: how many cards, from 1 to 1000 (default 200).
- `since`: an ISO timestamp. Only cards never priced or priced before it are picked; the Options page's loop passes the time it started and repeats until the answer has `total` of 0.
- `card_id`: switches to single-card mode. It needs a session, and when it cannot price the card it answers with an error status (for example 422 `no_pricing_yet`) instead of a summary.

Cards that cannot be priced (a special variant, missing identifiers) still get `cm_updated_at` touched so they cannot clog the front of the queue. The answer is a summary: `ok`, `total`, `updated`, `backfilled`, `skipped`, `source_cardmarket`, `source_tcgdex`, `ambiguous` and `errors`. Each run ends by upserting the day's row in `stock_value_snapshots`.

**`/api/prices/snapshot`** calls the SQL function `insert_daily_price_snapshot()`, which upserts one daily `price_history` row per priced card, and answers `{ ok, snapshot_count }`.

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://<your-app>.vercel.app/api/prices/update?limit=50"
curl -H "Authorization: Bearer $CRON_SECRET" "https://<your-app>.vercel.app/api/prices/snapshot"
```

## The Vinted agent

[`vinted-agent/`](../vinted-agent/README.md) is a Python 3.10 or newer program with its own virtual environment, tests and launchers. Setup is in [SETUP.md](SETUP.md#the-vinted-agent); its two READMEs ([README](../vinted-agent/README.md), in French, and [DEPLOY.md](../vinted-agent/DEPLOY.md)) cover machines and the VPS. The commands below run from `vinted-agent/`, with `python` meaning the virtual environment's interpreter (`.venv/bin/python`, or `.venv\Scripts\python.exe` on Windows).

| Command | What it does | Kind |
|---|---|---|
| `./start.sh` | The WSL launcher. Starts `pproxy -l http://:1080` and `ngrok tcp 1080`, reads the tunnel address from ngrok's local API, exports it as `VINTED_PROXY` (so CapSolver can reach the proxy), runs `python3 main.py`, and stops the proxy and the tunnel when the agent exits. Needs `pproxy` and `ngrok` with an auth token. | Recurring |
| `./start-mac.sh` | The macOS twin. Uses `.venv/bin/python` and `.venv/bin/pproxy` when `setup-mac.sh` created them, and reads the tunnel address from ngrok's log. | Recurring |
| `powershell -ExecutionPolicy Bypass -File .\start-windows.ps1` | The native Windows twin, without WSL. | Recurring |
| `python main.py` | The agent itself, without arguments. It needs `.env` (`SUPABASE_URL`, `SUPABASE_KEY`) and `vinted_users.json`. Without a launcher there is no proxy, so no automatic CAPTCHA solving. It subscribes to Realtime inserts on `vinted_post_jobs`, drains the pending jobs at start-up, then runs the heartbeat (30 s), scheduling (5 min) and attribute-request (5 s) loops ([ARCHITECTURE.md](ARCHITECTURE.md#data-flow-vinted-listings-and-the-bot)). Run one instance only. | Recurring |
| `./setup-mac.sh [folder]`, `powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1 [folder]` | Onboards a machine from an `iris-mac-transfer/` folder exported from another one (default `<repository>/iris-mac-transfer`). Copies `env.local` to `.env.local`, `vinted-agent.env` to `.env`, `vinted_users.json` and `cookies*.json` into place; creates `.venv` and installs `requirements.txt` and `pproxy`; runs `npm install` and installs Playwright's Chromium at the repository root (for the store-events scraper, which runs on GitHub Actions now); checks for `ngrok`. It fails without that folder, so a first install does the steps by hand. Delete the folder afterwards: it holds secrets. | One-shot, per machine |
| `python -m pytest` | The agent's tests: 153 tests in 5 files (`main_test.py`, `scheduler_test.py`, `vinted_api_test.py`, `catalog_attributes_test.py`, `titles_test.py`), with Supabase mocked. No `.env` is needed. The suite takes about 85 seconds, because some `other_item` tests wait for the real posting delays ([TECH_DEBT.md](TECH_DEBT.md#slow-agent-tests)). | Recurring |
| `python import_cookies.py <export.json> --user <account>` | Converts a Cookie-Editor export of a logged-in vinted.fr session into `cookies_<account>.json`: it keeps the eight Vinted cookie names, merges them with the existing file and checks that the token's scope is `user`. `--user` defaults to the owner's account name, and omitting the path falls back to a hard-coded WSL download path; pass both. Paste the resulting file into the settings of `/vinted/bot`; the form refuses a raw Cookie-Editor export. Use it when a session expires (a 403, or signed out). | Occasional |
| `python fetch_categories.py` | Fetches Vinted's category tree through the owner's session (the cookies file name is hard-coded in the script, so that file must exist) and rewrites `lib/data/vinted-categories.json`, the static list behind the Items category picker. Re-runnable; commit the result. | Occasional |
| `python clear_jobs.py` | **Deletes every row of `vinted_post_jobs`**: pending, processing, done and failed, for every account, without asking. It reads `SUPABASE_URL` and `SUPABASE_KEY` from `.env` in the current folder and prints `Deleted N jobs`. A pending job deleted this way is gone for good: the queue row it came from was removed when the job was created. Use it only to unstick a broken queue. | Occasional |
| `python export_my_listings.py`, `python import_scraped_other_items.py`, `python activate_scraped_other_items.py` | Three one-offs from the launch of the Items feature. The first saves the titles, descriptions and photos of eleven hard-coded live Vinted listings of the owner to `~/vinted-export-other-items/`. The second loads that export (`vinted-agent/export-other-items/manifest.json`, git-ignored) into `other_items` with placeholder categories. The third assigns real categories and sets the rows to `for_sale`, so the queue trigger enqueues them. The last two read `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the root `.env.local` and hard-code the owner's user id (`FRED_USER_ID`). Do not run them again. | One-shot |

On a VPS the agent runs as a systemd service from [`deploy/vinted-agent.service`](../vinted-agent/deploy/vinted-agent.service); the steps are in [DEPLOY.md](../vinted-agent/DEPLOY.md).

## Showcase tooling

[`SHOWCASE/capture/`](../SHOWCASE/capture/) records every image and GIF of the README, and doubles as the local run without keys ([SETUP.md](SETUP.md#run-it-locally-without-any-keys)). It never touches the production project: it builds a throwaway Supabase in Docker from the project's own migrations, loads sanitized fixtures, serves the app against it with every external key blanked, and drives Playwright. Kind: **Occasional**. The reasons and how to add a shot are in [CONTRIBUTING.md](CONTRIBUTING.md#refreshing-the-readme-visuals).

```bash
cd SHOWCASE/capture
npm install                          # once: Playwright, the Supabase CLI and pg, in this folder only
npx playwright install chromium      # once: the browser, to record shots (not needed for --serve)
node capture.mjs                     # record every shot into SHOWCASE/media/ (Docker must be running)
node capture.mjs dashboard vinted    # only these shots
node capture.mjs --keep              # leave the stack and the app running afterwards
node capture.mjs --reuse vinted      # iterate on a shot: reuse the loaded stack and a running app (implies --keep)
node capture.mjs --serve             # record nothing: serve the seeded app on 127.0.0.1:3100 to click around in
node stack.mjs start                 # only the Supabase stack: start it, or reuse the running one, and print its URLs and keys
node stack.mjs stop                  # remove the stack and its data
```

`npm run capture`, inside that folder, is `node capture.mjs`. The shot names are the keys of the `SHOTS` table in `capture.mjs`.

- **Needs.** Docker running, and the repository's own `npm install` at the root, because the tooling starts the root's `next` and `tsx`. Recording also needs ffmpeg and Python 3 for the GIFs (the `PYTHON` variable picks the interpreter; default `python3`, or `python` on Windows).
- **The stack.** `stack.mjs` copies `supabase/config.toml` and the migrations into `iris-showcase-stack` in the system's temporary folder, adds a first migration that enables `pg_cron`, shifts every port by 1000 and runs `supabase start` without the services the app does not use (Studio, the mail catcher and others). A stack that is already running is reused: `stack.mjs start` leaves its data alone, while `capture.mjs` resets it to the migrations (`db reset`) unless you pass `--reuse`.
- **The data.** `seed.mjs` loads `fixtures/`, a sanitized snapshot of production data from 2026-10-10 (two test accounts in `fixtures/users.json`, fake Vinted ids, renamed PTCG opponents, no notes, a few dozen resized photos), plus the catalog snapshots from `backups/`. The PTCG board states are rebuilt from the logs by the project's own parser (`ptcg-state.ts`, run with the root's `tsx`). Dates are shifted so the data looks as fresh as the day of the capture. Keep the fixtures sanitized when you add some.
- **The app.** `app.mjs` runs `next dev` from the repository root on port 3100 with the API keys blanked; `capture.mjs` answers the scanner's OCR call from `fixtures/scan.json`, so no Gemini key is needed.
- **Writes.** Everything goes to `SHOWCASE/media/`; working files go to the temporary folder and are deleted afterwards.
- **`make_gif.py`** turns a recording into a GIF of exactly 960 by 540 pixels under a size budget: `make_gif.py INPUT OUTPUT [--cut START:DURATION ...] [--crop W:H:X:Y] [--speed 1.0] [--fps 12] [--max-mb 4] [--pad black]`. It needs ffmpeg and ffprobe on the path and the Python standard library only. `capture.mjs` calls it; you rarely run it yourself.
