# I.R.I.S — backups

## Two distinct things live here

### `tcg_catalog.jsonl.gz` + `rarity_ranks.json` — fixed enrichment data

These are versioned snapshots of the static data used to enrich scanned cards.
Regenerate after each full LimitlessTCG re-scrape:

```bash
npm run scrape -- --langs=jp,en,fr   # ~12 min (or ~3h with SCRAPE_ILLUSTRATOR=1)
npm run snapshot-catalog
git add backups/
git commit -m "snapshot tcg_catalog YYYY-MM-DD"
```

### Restore the catalog (e.g. after a wipe)

```bash
npm run restore-catalog
# Confirms before TRUNCATE. Set SKIP_CONFIRM=1 to bypass.
```

Requires `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.

## User data backups → GitHub Releases

Daily backups of `cards`, `lots`, `card_listings`, `lot_listings`,
`user_profiles`, `config`, `ocr_usage_log`, `stock_value_snapshots` run via
`.github/workflows/backup.yml` at 3 AM UTC.

Tags:
- `backup-daily-YYYY-MM-DD` (kept 30 days)
- `backup-weekly-YYYY-WXX` (kept 12 weeks, Sundays)
- `backup-monthly-YYYY-MM` (kept 12 months, 1st of month)
- `backup-manual-YYYY-MM-DD-HHMMSS` (NEVER auto-deleted) — triggered from /options

### Restore from a release backup

```bash
gh release download backup-daily-2026-05-08 --pattern '*.sql.gz' --dir /tmp
gunzip /tmp/dump.sql.gz

# The dump is --data-only — it does NOT DROP/TRUNCATE.
# Truncate first to avoid PK conflicts:
psql "$SUPABASE_DB_URL" -c "
  TRUNCATE cards, lots, card_listings, lot_listings,
           user_profiles, config, ocr_usage_log, stock_value_snapshots
  RESTART IDENTITY CASCADE;
"
psql "$SUPABASE_DB_URL" < /tmp/dump.sql
```

### Restore a manual backup (JSON format)

Manual backups (from /options) are JSON, not SQL. Use `scripts/restore-manual.ts`
(not yet implemented — out of scope v1; restore via psql + JSON parsing if needed).
