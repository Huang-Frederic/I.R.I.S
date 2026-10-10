# I.R.I.S backups

Two kinds of data are protected in two different ways:

- **Reference data** (the card catalog and the Cardmarket index) is slow and sometimes costly to rebuild, so snapshots of it are committed in this folder and put back with npm scripts.
- **User data** (cards, lots, listings) is backed up outside git: by hand from the Options page, and by a scheduled GitHub Actions job.

## Snapshots in this folder

Each snapshot is a gzipped JSONL file (one JSON row per line), or plain JSON for the small `rarity_ranks.json`. A new snapshot overwrites the file in place; git keeps the history.

| File | Table | Rows | Snapshot date | Written by | Restored by |
|---|---|---|---|---|---|
| `tcg_catalog.jsonl.gz` | `tcg_catalog`, the LimitlessTCG scrape (JP, EN and FR cards) | 52,724 | 2026-05-06 | `npm run snapshot-catalog` | `npm run restore-catalog` |
| `rarity_ranks.json` | `rarity_ranks` | 10 | 2026-05-06 | `npm run snapshot-catalog` | `npm run restore-catalog` |
| `cardmarket_card_index.jsonl.gz` | `cardmarket_card_index`, the (expansion, set number) to Cardmarket product map | 48,457 | 2026-05-10 | `npm run snapshot-cardmarket-index` | `npm run restore-cardmarket-index` |
| `cardmarket_expansions.jsonl.gz` | `cardmarket_expansions`, with the `set_prefix` column that only the BrightData scraper fills | 741 (645 with a `set_prefix`) | 2026-05-10 | `npm run snapshot-cardmarket-index` | `npm run restore-cardmarket-expansions` |

The dates are those of the commits that last touched each file (`git log -- backups/<file>`). The Cardmarket pair was taken after the 2026-05-10 rescrape. `npm run snapshot-cardmarket-index` writes both Cardmarket files in one run; there is no separate command for the expansions.

The snapshots stop at May 2026. Sets released since then are not in them: they come in through `npm run update-expansions`, which is blocked until the BrightData token is renewed (it expired on 2026-10-05, see [scrapers/cardmarket/README.md](../scrapers/cardmarket/README.md)).

All the snapshot and restore scripts read `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`.

## Refreshing a snapshot

After a full LimitlessTCG re-scrape, snapshot the catalog. The scrape only crawls with `MODE=full` (the default is a one-set probe that writes nothing):

```bash
MODE=full LANGUAGES=jp,en,fr npx tsx scripts/scrape-limitlesstcg.ts   # about 12 minutes; add SCRAPE_ILLUSTRATOR=1 for the illustrator field (about 3 hours)
npm run snapshot-catalog
git add backups/
git commit -m "chore(backups): snapshot tcg_catalog YYYY-MM-DD"
```

After a successful Cardmarket scrape (`npm run update-expansions`, or the scraper run by hand), snapshot the index and the expansions together, so the hours of scraping and the BrightData credits are not lost:

```bash
npm run snapshot-cardmarket-index
git add backups/
git commit -m "chore(backups): snapshot cardmarket index and expansions YYYY-MM-DD"
```

Commit messages follow [CONTRIBUTING.md](../docs/CONTRIBUTING.md).

## Restoring reference data on a fresh database

Run the steps in this order:

```bash
npx supabase db push                      # 1. create the tables
npm run restore-catalog                   # 2. tcg_catalog and rarity_ranks
npm run restore-cardmarket-expansions     # 3. cardmarket_expansions, with their set_prefix
npm run upload-cardmarket-dumps           # 4. cardmarket_products and cardmarket_pricing, from Cardmarket's public dumps
npm run restore-cardmarket-index          # 5. cardmarket_card_index
```

The order matters at one point: a row of `cardmarket_card_index` references both its expansion and its product (`cardmarket_products.id_product`), so step 5 fails until steps 3 and 4 have run. Step 4 cannot stand in for step 3, because `set_prefix` only comes from the scraper: the nightly upload writes names, never the prefix. And step 4 downloads the products and prices from Cardmarket (about 30 seconds) instead of restoring them, because the nightly GitHub Action keeps them fresh and they are not snapshotted.

The restore scripts ask for confirmation first; `SKIP_CONFIRM=1` skips the prompt. `restore-catalog` empties `tcg_catalog` and `rarity_ranks` before it inserts, and `restore-cardmarket-index` deletes every row of the index first. `restore-cardmarket-expansions` upserts instead of deleting, because `cardmarket_products` has a foreign key to the expansions and a delete would cascade into it.

## User data backups

The manual backup and the GitHub job cover the same eight tables, and nothing else:

`cards`, `lots`, `card_listings`, `lot_listings`, `user_profiles`, `config`, `ocr_usage_log` and `stock_value_snapshots`.

Neither covers the `ptcg_*` tables, `other_items`, the Vinted bot's queue, schedule, settings and sessions, `price_history`, `audit_logs`, or the photos in the Storage buckets. The reference tables above are restored from this folder instead. See "Backups cover 8 of 33 tables, and no photos" in [TECH_DEBT.md](../docs/TECH_DEBT.md).

### Manual backup, from the Options page

On the Options page, "Create a backup now" calls `POST /api/backup/manual` ([`app/api/backup/manual/route.ts`](../app/api/backup/manual/route.ts)). The route reads the eight tables, paging past the 1,000-row cap, wraps them as

```json
{ "version": "v1", "created_at": "<ISO date>", "tables": { "cards": [], "lots": [], "...": [] } }
```

gzips the JSON, and uploads it to the **private Supabase Storage bucket `manual-backups`** as `iris-YYYY-MM-DD-HHMMSS.json.gz` (UTC). It is not a GitHub release. The page lists the files (newest first, 100 at most), downloads one through a signed URL valid for one hour, and deletes one. Nothing rotates or deletes them automatically. The bucket has no policies, so only the service-role key reaches it.

There is **no restore script**: `scripts/restore-manual.ts` does not exist, and the Options page has no restore button. The file is plain JSON, so a restore means gunzipping it and inserting each table's array with the service-role key, on a database where the two auth users already exist (the rows reference their ids). Insert `lots` before `cards` (a card can point at a lot), and both before `card_listings`, `lot_listings` and `ocr_usage_log`.

### Scheduled backup, from GitHub Actions

[`.github/workflows/backup.yml`](../.github/workflows/backup.yml) runs every day at 03:00 UTC (and on demand). It runs `pg_dump --data-only` on the eight tables, gzips the result to `dump.sql.gz` and publishes it as a GitHub pre-release. [`scripts/backup/rotate.sh`](../scripts/backup/rotate.sh) then prunes old ones. The tags are:

- `backup-daily-YYYY-MM-DD`, the 30 most recent kept.
- `backup-weekly-YYYY-Www`, made on Sundays, the 12 most recent kept.
- `backup-monthly-YYYY-MM`, made on the 1st, the 12 most recent kept.

There is no `backup-manual-*` tag: manual backups never become releases.

**This job does not currently produce a usable backup.** The audit of 2026-10-10 found that it reports success while uploading empty files, and that fixing it would publish user data on the releases of a public repository. Until both are settled, the manual backup is the only working database backup, and the releases cannot restore anything. The details and the fix are in [TECH_DEBT.md](../docs/TECH_DEBT.md).

Once the job works, a release is restored like this:

```bash
gh release download backup-daily-YYYY-MM-DD --pattern '*.sql.gz' --dir /tmp
gunzip /tmp/dump.sql.gz

# The dump is data-only: it neither drops nor truncates.
# Empty the tables first, or the primary keys collide:
psql "$SUPABASE_DB_URL" -c "
  TRUNCATE cards, lots, card_listings, lot_listings,
           user_profiles, config, ocr_usage_log, stock_value_snapshots
  RESTART IDENTITY CASCADE;
"
psql "$SUPABASE_DB_URL" < /tmp/dump.sql
```

`CASCADE` also empties every table that references these ones, and none of them is in the dump: `price_history`, `vinted_queue` and `vinted_post_jobs` among them. That is what you want on a fresh database; on a live one, it is data you lose.
