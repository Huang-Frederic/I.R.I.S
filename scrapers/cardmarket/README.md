# Cardmarket scraper (BrightData)

Reads Cardmarket's Pokémon gallery pages, one expansion at a time, and upserts the result into Supabase: the `cardmarket_card_index` table (the map from a card's expansion and set number to its Cardmarket product) and the `set_prefix` column of `cardmarket_expansions`. What the index is for, and how it came about, is told in [docs/CARDMARKET_MAPPING.md](../../docs/CARDMARKET_MAPPING.md).

> **History.** This started as an Apify Actor, to get past Cardmarket's Cloudflare WAF. That approach failed (the residential proxy and headless Playwright were flagged every time), so the scraper moved to **BrightData Web Unlocker**, which solves the captcha and the bot fingerprint on its own. The code kept the structure of an Actor: the Apify SDK is still used locally for its Input/Output helpers, but the HTTP request itself is a plain `fetch()` to BrightData. Nothing is deployed on Apify's cloud, and nothing depends on the Apify service.

## The normal entry point: `npm run update-expansions`

To teach the app a freshly released set, run `npm run update-expansions` from the repository root ([`scripts/update-cardmarket-expansions.ts`](../../scripts/update-cardmarket-expansions.ts)). It does everything around this scraper, then runs it:

1. Fetches Cardmarket's French, English and Japanese expansion lists through BrightData.
2. Compares them with the committed [`cardmarket_expansions.json`](../../cardmarket_expansions.json) and adds the new ids to it. Commit that file, or the nightly price import keeps dropping the products of the new sets.
3. Upserts every expansion row with its names.
4. Loads the new sets' products and prices from Cardmarket's public dumps.
5. Writes this scraper's `INPUT.json` (French-localised duplicates skipped) and runs the scraper on the new sets.
6. Checks that each new set now has a `set_prefix` and index rows.

Flags: `--dry-run` (report only, write nothing), `--no-scrape` (stop before step 5) and `--rescrape-missing[=minId]` (also scrape known expansions whose `set_prefix` is still empty, from that id up). In the root `.env.local` it needs `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `BRIGHTDATA_TOKEN`, and it is safer to set `BRIGHTDATA_ZONE` too (see below). It runs the scraper only if this folder's dependencies are installed, so do the install step first.

This README is for running the scraper itself: a smoke test on one expansion, or a full backfill.

## BrightData token

Every request goes through BrightData's Web Unlocker API, so nothing works without a valid token: neither this scraper nor `update-expansions`, which reads the expansion lists the same way. You need a BrightData account, a Web Unlocker zone, and an API token from <https://brightdata.com/cp/api_tokens>.

**The current token expired on 2026-10-05, which blocks every new set.** `cardmarket_expansions.json` still lists the 741 expansions of May, so the nightly import drops the products of the sets released since (the 30th Celebration among them), and their cards have no Cardmarket id or price; they are still identified through TCGdex. To unblock: renew the token, put it in `.env.local` as `BRIGHTDATA_TOKEN`, run `npm run update-expansions`, and commit the updated JSON. [docs/TECH_DEBT.md](../../docs/TECH_DEBT.md) tracks it.

## Install

This folder has its own `package.json` and lockfile. The root `npm install` does not install it:

```bash
cd scrapers/cardmarket
npm install        # or `npm ci`, for the exact versions in the lockfile
```

## Configuration

The scraper reads environment variables. Run by hand, it loads `scrapers/cardmarket/.env` (gitignored); launched by `update-expansions`, it inherits the root `.env.local` instead, and `update-expansions` maps `NEXT_PUBLIC_SUPABASE_URL` to `SUPABASE_URL` for it.

```bash
# scrapers/cardmarket/.env
BRIGHTDATA_TOKEN=<your-token>
BRIGHTDATA_ZONE=<your-web-unlocker-zone>
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

Set `BRIGHTDATA_ZONE` explicitly. Left unset, the scraper uses the zone name `web_unlocker1`, while the root scripts (`update-expansions` and its own requests) default to `iris`, which is also what `.env.example` suggests.

## Running it by hand

The scraper takes its input from the Apify SDK's local storage, `storage/key_value_stores/default/INPUT.json` in this folder (the `storage/` folder is gitignored). Generate an input from the repository root, then copy it there:

```bash
mkdir -p scrapers/cardmarket/storage/key_value_stores/default

# Option A: every known expansion (a full backfill; expansions that already have index rows
# are skipped, since the input sets skipExisting). Writes cardmarket-input.json at the root.
npm run build-cardmarket-input
cp cardmarket-input.json scrapers/cardmarket/storage/key_value_stores/default/INPUT.json

# Option B: only the expansions that still have no set_prefix.
# Writes scrapers/cardmarket/.actor/RESCRAPE_INPUT.json.
npx tsx scripts/generate-rescrape-input.ts
cp scrapers/cardmarket/.actor/RESCRAPE_INPUT.json scrapers/cardmarket/storage/key_value_stores/default/INPUT.json

cd scrapers/cardmarket
npm start          # runs `tsx src/main.ts`
```

To scrape a single expansion (a smoke test), write the input by hand:

```json
{
  "expansions": [
    { "idExpansion": 1521, "name": "Vigueur Spectrale", "slug": "Vigueur-Spectrale" }
  ],
  "skipExisting": false,
  "concurrency": 1
}
```

The input fields are `expansions` (each with `idExpansion`, `name` and `slug`), `skipExisting` (default `true`: skip expansions that already have index rows), `concurrency` (default 3) and `perPage` (default 30, Cardmarket's own default; higher values silently fail on some sets).

## What it does

```
src/
├── main.ts          # Entry point: loads the input, dispatches the workers, aggregates the results
├── scrape.ts        # Pure DOM parser (testable under happy-dom) -> ScrapedCard[]
├── scrape.test.ts   # Parser tests
├── supabase.ts      # Supabase client and helpers (expansionAlreadyIndexed, upsertCards)
└── types.ts         # Shared interfaces
```

Stack: Node 22 or newer (recent `@supabase/supabase-js` versions need it), `fetch()` straight to BrightData (no Playwright), jsdom to parse the HTML it returns, dotenv for the local credentials.

For each expansion it pages through the gallery (waiting 0.5 to 1.5 seconds between pages) and upserts into Supabase:

- `cardmarket_card_index`: `id_product` (primary key, foreign key to `cardmarket_products`), `id_expansion`, `set_number`, `url_variant`, `language`, `url_path`.
- `cardmarket_expansions.set_prefix`: the prefix of the expansion's image URLs, taken from the first card that has one.

After a run, snapshot the result with `npm run snapshot-cardmarket-index` from the repository root. It writes `backups/cardmarket_card_index.jsonl.gz` and `backups/cardmarket_expansions.jsonl.gz` (see [backups/README.md](../../backups/README.md)).

`npm test` in this folder runs the parser tests; the root `npm test` runs them too.

## Cost

About 3,000 requests (741 expansions at roughly 4 pages each) at $1.50 per thousand, so around **$4.50** for a full backfill. BrightData's $5 free credit could cover one. A single new set costs a few cents at most.

## Known failure modes

| Situation | Symptom | Fix |
|---|---|---|
| Foreign key violation `cardmarket_card_index_id_product_fkey` | The scrape found `id_product`s that are not in `cardmarket_products` (the daily dump is behind) | Run `npm run upload-cardmarket-dumps`, then re-scrape only those expansions |
| BrightData rejects every request | The error starts with `BrightData HTTP` and a status code. A wrong or expired token fails this way | Check `BRIGHTDATA_TOKEN` and `BRIGHTDATA_ZONE`; the token that expired on 2026-10-05 needs renewing |
| Cardmarket answers 403 (Cloudflare) | Not expected through BrightData; otherwise contact BrightData support | Regenerate the token, and check that the zone is a Web Unlocker zone, not a datacenter one |

## See also

- [docs/CARDMARKET_MAPPING.md](../../docs/CARDMARKET_MAPPING.md): why the index exists, how it was built, the edge cases.
- [docs/SETUP.md](../../docs/SETUP.md#catalog-and-pricing-data): the setup steps, and [docs/COMMANDS.md](../../docs/COMMANDS.md#the-cardmarket-scraper) for every command.
- [docs/COMMANDS.md](../../docs/COMMANDS.md): every root script this page mentions.
