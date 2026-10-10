# Setup

From an empty Supabase project to a deployed copy of I.R.I.S, plus a shortcut that needs no account and no key. The code map is in [ARCHITECTURE.md](ARCHITECTURE.md), the database in [SUPABASE.md](SUPABASE.md), every script in [COMMANDS.md](COMMANDS.md), and the conventions of the repository in [CONTRIBUTING.md](CONTRIBUTING.md). What follows was checked against the code, `vercel.json` and the four workflows on 2026-10-11.

Only want to see the app? Go to [Run it locally without any keys](#run-it-locally-without-any-keys): Docker and three commands, nothing to create.

## Contents

- [What you need](#what-you-need)
- [Environment variables](#environment-variables)
- [Supabase project](#supabase-project)
- [Accounts](#accounts)
- [Database migrations](#database-migrations)
- [Gemini and Google Vision keys](#gemini-and-google-vision-keys)
- [Catalog and pricing data](#catalog-and-pricing-data)
- [Run the app](#run-the-app)
- [Deploy on Vercel](#deploy-on-vercel)
- [GitHub Actions](#github-actions)
- [The Vinted agent](#the-vinted-agent)
- [Run it locally without any keys](#run-it-locally-without-any-keys)
- [Troubleshooting](#troubleshooting)

## What you need

| Tool | Version | Used for |
|---|---|---|
| Node.js | 22 or later (`.nvmrc` says `22`, `engines` in `package.json` says `>=22.0.0`) | the app, the `npm run` scripts (run with `tsx`), the Cardmarket scraper |
| npm | the one that ships with Node | |
| Git | any | |
| Supabase CLI | nothing to install: every command below uses `npx supabase` | `link` and `db push` |
| Docker | a recent version | only the [local run without keys](#run-it-locally-without-any-keys) |
| Python | 3.10 or newer | only the [Vinted agent](#the-vinted-agent) |

| Service | Used for | Required |
|---|---|---|
| Supabase | database, auth, storage, realtime | yes |
| Google AI Studio (Gemini) and Google Cloud (Vision) | reading card photos | at least one of the two, for the scanner |
| Vercel | hosting the app and its four cron schedules | for a deployment |
| GitHub | the four scheduled workflows | optional |
| BrightData (Web Unlocker) | importing newly released Cardmarket sets | optional |
| Vinted accounts and a machine that stays on | the posting bot | optional |

Get the code and install the dependencies:

```bash
git clone https://github.com/Huang-Frederic/I.R.I.S.git && cd I.R.I.S
nvm use 22            # any Node 22 or later works
npm install           # the app and the scripts; scrapers/cardmarket and SHOWCASE/capture have their own installs
```

## Environment variables

Every variable the code reads, in one place. Locally they live in `.env.local` at the repository root. It is git-ignored, and [`.env.example`](../.env.example) is the template. Next.js and the scripts load that file on their own. On Vercel the same names go under Project Settings, Environment Variables. Never commit a filled-in `.env*` file, and never paste a value into an issue, a log or a doc.

```bash
cp .env.example .env.local     # fill it in as you go through the next sections
```

### Web app variables

| Variable | Needed | Read by | What it is |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | the browser and server Supabase clients, `proxy.ts`, the scripts that talk to Supabase | The project URL, `https://<project-ref>.supabase.co` ([Supabase project](#supabase-project)). It also builds the public Storage image URLs in the browser. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | the browser and server clients, `proxy.ts` | The `anon` key. It ships in the browser bundle by design; row-level security is the access control. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | `lib/supabase/service.ts` (server only), the scripts that talk to Supabase, the workflows | The `service_role` key. It bypasses row-level security: keep it on the server, out of git and out of logs. |
| `GEMINI_API_KEY` | one of the two | `lib/api/gemini-vision.ts` | Primary card OCR ([Gemini and Google Vision keys](#gemini-and-google-vision-keys)). |
| `GOOGLE_VISION_API_KEY` | one of the two | `lib/api/vision.ts` | OCR fallback, used when Gemini returns nothing usable. |
| `CRON_SECRET` | on Vercel | `/api/prices/update`, `/api/prices/snapshot` | A random string, for example the output of `openssl rand -hex 32`. Vercel Cron sends it as `Authorization: Bearer <value>`. Locally it only matters if you call those two routes by hand. |
| `VINTED_USER_IDS` | for Vinted | the `/vinted` and `/vinted/bot` pages, `POST /api/vinted/post-job`, `/bump-job` and `/sessions`, the queue sync | Comma-separated Supabase auth user ids allowed to post to Vinted. Without it the Vinted buttons and the bot page stay off. Use the ids from [Accounts](#accounts); they must name the same accounts as the agent's `vinted_users.json`. |
| `NEXT_PUBLIC_APP_URL` | no | nothing | It is in `.env.example`, but no code reads it ([TECH_DEBT.md](TECH_DEBT.md#identity-and-data-model) lists it among the unused settings). Set it or leave it out: nothing changes. |

`NODE_ENV` is the only other variable the app reads, and Next.js sets it.

### Script and scraper variables

These go in the same `.env.local`, except where noted. Each script's usage is in [COMMANDS.md](COMMANDS.md).

| Variable | Needed | Read by | What it is |
|---|---|---|---|
| `BRIGHTDATA_TOKEN` | to import new sets | `update-expansions`, `scrape-cm-expansion-names`, `debug-scraper-fetch.ts`, `scrapers/cardmarket` | A BrightData Web Unlocker API token (brightdata.com, API tokens). |
| `BRIGHTDATA_ZONE` | no | the same four | The Web Unlocker zone name. The root scripts default to `iris`, the scraper itself defaults to `web_unlocker1`, so set it explicitly. |
| `SUPABASE_URL` | for the scraper | `scrapers/cardmarket` | The same value as `NEXT_PUBLIC_SUPABASE_URL`. Run by hand, the scraper reads it from `scrapers/cardmarket/.env`; launched by `update-expansions`, it inherits the root environment, with `NEXT_PUBLIC_SUPABASE_URL` copied into it. Several scripts also accept it in place of `NEXT_PUBLIC_SUPABASE_URL`. |
| `SKIP_CONFIRM` | no | `restore-catalog`, `restore-cardmarket-index`, `restore-cardmarket-expansions` | `1` skips the "Continue? [y/N]" prompt. |
| `BROWSER_CHANNEL` | no | `scrape-cardmarket` | `chromium` uses Playwright's bundled Chromium instead of the system Chrome. |
| `MODE`, `SET`, `PROBE_LANG`, `LANGUAGES`, `ONLY_SETS`, `SCRAPE_ILLUSTRATOR`, `FORCE_RESCRAPE`, `INSECURE_HTTPS` | no | `scrape-limitlesstcg.ts` | The switches of the LimitlessTCG crawler, described in [COMMANDS.md](COMMANDS.md#scrape-limitlesstcgts). |
| `PYTHON` | no | `SHOWCASE/capture/capture.mjs` | The Python executable that builds GIFs (default `python3`, or `python` on Windows). |

### Agent variables

The Vinted agent reads its own `vinted-agent/.env` (git-ignored; template `vinted-agent/.env.example`), not `.env.local`.

| Variable | Needed | What it is |
|---|---|---|
| `SUPABASE_URL` | yes | The project URL. |
| `SUPABASE_KEY` | yes | The `service_role` key, not the anon key. |
| `CAPSOLVER_KEY` | no | A CapSolver key, so the bot can solve the DataDome CAPTCHA that Vinted sometimes serves. Without it a post that hits a CAPTCHA fails; the bot keeps running. |
| `VINTED_PROXY` | no | A proxy CapSolver can reach. The launchers start `pproxy` behind an `ngrok` tunnel and export it themselves. |

GitHub Actions secrets and variables are listed under [GitHub Actions](#github-actions).

## Supabase project

1. Sign in at [supabase.com](https://supabase.com) and create a project. Pick a region close to where the Vercel functions will run, and keep the database password: `supabase link` asks for it.
2. Project Settings, API: copy the project URL, the `anon` key and the `service_role` key into `.env.local` as `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. Newer dashboards also offer publishable and secret keys; the variables are named after the legacy `anon` and `service_role` keys. The subdomain of the URL is the project ref that `supabase link` wants.
3. Database, Extensions: enable `pg_cron` **before the first push**. `20260513000000_price_history.sql` schedules a weekly job with `cron.schedule(...)`, and nothing in the migrations creates the extension.
4. Leave Storage and Realtime alone. The migrations create the four buckets and publish `vinted_post_jobs` to Realtime. The one table they do not publish, `card_listings`, is covered in [SUPABASE.md](SUPABASE.md#realtime).

## Accounts

I.R.I.S has two accounts and no sign-up page: the app only calls `signInWithPassword`. The shared tables trust every signed-in session, so the project must hold those two accounts and nobody else ([why](SUPABASE.md#why-every-signed-in-user-is-trusted)).

1. Authentication, Users, Add user, Create new user, once per account, with a real email and a password. Confirm the user (the dashboard's "Auto Confirm User" option) so that it can sign in at once. Auth works before any migration has run, so do this now. Note both user ids.
2. Authentication, Sign In / Providers: turn off new user signups. The anon key is public, so while signups are open anyone can create an account and get the same access.
3. Put the two ids in `VINTED_USER_IDS` (comma-separated) if both accounts use the Vinted bot.
4. Decide about Items. The Items feature (`other_items`, non-card products sold on Vinted) belongs to one account whose id is written into the source: five migrations, `lib/vinted/other-item-queue-sync.ts` and a few display-name maps. A new install has to replace it, **before the first `db push`** if you want Items, because the migrations name the id in their policies. If you leave it alone, nobody matches it, Items stay unavailable and nothing else depends on it. Every place, and how to replace each one, is listed in [CONTRIBUTING.md](CONTRIBUTING.md#accounts-and-hard-coded-user-ids); why the policies work that way is in [SUPABASE.md](SUPABASE.md#the-owner-uuid).

The display names go into `user_profiles` once the migrations have run (see [Insert the profiles](#insert-the-profiles)).

## Database migrations

The 71 files in [`supabase/migrations/`](../supabase/migrations/) run in file-name order.

```bash
npx supabase login                                  # once; opens the browser
npx supabase link --project-ref <PROJECT_REF>       # asks for the database password
npx supabase db push
```

With `pg_cron` not enabled yet, the push stops at `20260513000000_price_history.sql` with `schema "cron" does not exist`. The files before it stay applied: enable the extension and push again. If you ran some files in the SQL editor yourself, tell the CLI not to replay them: `npx supabase migration repair --status applied <TIMESTAMP>`, once per file.

The migrations create the 33 tables with row-level security, the enums, functions and triggers, the weekly `pg_cron` job and the four Storage buckets (`card-photos`, `lot-photos` and `other-item-photos` with public reads, `manual-backups` private). [SUPABASE.md](SUPABASE.md) documents them, and its [New hosted project](SUPABASE.md#new-hosted-project) checklist has the queries that confirm the result: 33 tables, 71 migrations, one cron job, four buckets.

### Insert the profiles

The phase 4 migration seeds `user_profiles` only for the two ids of the original install, and only if they exist, so a new project needs its own rows. Run this in the SQL editor with the ids from [Accounts](#accounts):

```sql
insert into user_profiles (user_id, display_name) values
  ('<user-1-uuid>', '<name 1>'),
  ('<user-2-uuid>', '<name 2>')
on conflict (user_id) do nothing;
```

The app shows these names throughout, and takes each account's partner to be the other row. Without a row it falls back to the account's email.

## Gemini and Google Vision keys

The scanner reads a card photo with Gemini first and falls back to Google Cloud Vision when Gemini returns nothing usable. Have at least one of the two keys: with neither, `/api/ocr` answers `ocr_failed` (HTTP 502).

**Gemini (primary).**

1. In [Google AI Studio](https://aistudio.google.com/app/apikey), create an API key and attach it to a Google Cloud project.
2. Enable billing on that project. `.env.example` notes that billing unlocks Tier 1 quotas (15 requests per minute), which the batch scanner (up to 30 photos, five at a time) is sized for ([ARCHITECTURE.md](ARCHITECTURE.md#data-flow-scan-pipeline)).
3. Put the key in `.env.local` as `GEMINI_API_KEY`.

The model is pinned in `lib/api/gemini-vision.ts` as `gemini-3.1-flash-lite-preview`. It is a preview model, so if scans suddenly return nothing, check that Google still serves it before blaming the key. `scripts/bench-multi-model.ts` compares models, but it reads photos from `cards_assets/`, a git-ignored folder you fill yourself ([COMMANDS.md](COMMANDS.md#bench-multi-modelts)). Every OCR call is logged to `ocr_usage_log`, and the dashboard shows the cost per day.

**Google Cloud Vision (fallback).**

1. In the Google Cloud console, enable the Cloud Vision API on a project that has a billing account (`.env.example`: free up to 1,000 units a month, billing required).
2. APIs & Services, Credentials, Create credentials, API key. Restrict the key to the Cloud Vision API.
3. Put it in `.env.local` as `GOOGLE_VISION_API_KEY`.

## Catalog and pricing data

The migrations create the schema, not the reference data. Matching a scan and pricing a card both read the tables below first ([ARCHITECTURE.md](ARCHITECTURE.md#data-flow-pricing-pipeline)). The fast path is to restore the snapshots committed in [`backups/`](../backups/README.md) and let Cardmarket's public dumps fill the rest.

| Table | Rows | Comes from | Loaded by |
|---|---|---|---|
| `tcg_catalog` | 52,724 (EN, FR, JP) | `backups/tcg_catalog.jsonl.gz` | `restore-catalog` |
| `rarity_ranks` | 10 | `backups/rarity_ranks.json` (the first migration seeds it too) | `restore-catalog` |
| `cardmarket_expansions` | 741 | names: `cardmarket_expansions.json`; `set_prefix`, `name_en`, `name_ja`: `backups/cardmarket_expansions.jsonl.gz` | `upload-cardmarket-dumps` (names), `restore-cardmarket-expansions` (the rest) |
| `cardmarket_products`, `cardmarket_pricing` | one per Cardmarket single | Cardmarket's public S3 dumps | `upload-cardmarket-dumps` |
| `cardmarket_card_index` | 48,457 | `backups/cardmarket_card_index.jsonl.gz` | `restore-cardmarket-index` |

Run them in this order, from the repository root, with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. The restore scripts ask "Continue? [y/N]" before they empty a table; `SKIP_CONFIRM=1` skips the prompt.

```bash
npm run restore-catalog                  # 1. tcg_catalog and rarity_ranks
npm run upload-cardmarket-dumps          # 2. expansions, products and prices; downloads Cardmarket's public dumps
npm run restore-cardmarket-expansions    # 3. set_prefix, name_en and name_ja, which the dump upload never writes
npm run restore-cardmarket-index         # 4. the card index; it must come last
```

Step 4 depends on step 2: every row of `cardmarket_card_index` points at a product and an expansion by foreign key, so restoring the index first fails with a foreign key violation. [SUPABASE.md](SUPABASE.md#restoring-catalog-data) gives the same order; [backups/README.md](../backups/README.md#restoring-reference-data-on-a-fresh-database) puts steps 2 and 3 the other way round, which works as well.

Check the result in the SQL editor:

```sql
select language, count(*) from tcg_catalog group by 1 order by 1;   -- EN 19,398, FR 14,667, JP 18,659
select count(*) from cardmarket_card_index;                          -- 48,457
```

**Keeping it current.**

- Prices: the `cardmarket-prices.yml` workflow runs `upload-cardmarket-dumps` every night ([GitHub Actions](#github-actions)).
- New sets: the snapshots stop in May 2026, and the nightly import drops every product whose expansion is not in `cardmarket_expansions.json`. `npm run update-expansions` teaches the app a new set: it needs a BrightData token, rewrites that JSON (commit it), imports the products and runs the scraper in [`scrapers/cardmarket/`](../scrapers/cardmarket/README.md). Follow the procedure in that README, and snapshot afterwards with `npm run snapshot-cardmarket-index`. As of 2026-10-11 the command is blocked: the BrightData token expired on 2026-10-05 ([TECH_DEBT.md](TECH_DEBT.md#new-sets-arent-imported-the-brightdata-token-expired)).
- Rebuilding `tcg_catalog` from LimitlessTCG is rarely needed. `scrape-limitlesstcg.ts` defaults to `MODE=probe`, which fetches one set and writes nothing; `MODE=full` runs the real crawl ([COMMANDS.md](COMMANDS.md#scrape-limitlesstcgts)). Snapshot the result with `npm run snapshot-catalog`.

## Run the app

```bash
npm run dev          # http://localhost:3000
```

Sign in with one of the two accounts. A quick check of an install: open `/dashboard`, `/pokedex`, `/stock`, `/vinted` and `/options`.

Camera capture needs a secure context. `localhost` qualifies; a phone that opens your computer's LAN address over plain HTTP does not. To scan from a phone on the same network, serve over HTTPS with a self-signed certificate, accept the browser warning, and open the LAN address that `next dev` prints:

```bash
npx next dev --experimental-https
```

For a production check, `npm run build && npm start`. The tests, type check and linter are covered in [CONTRIBUTING.md](CONTRIBUTING.md#running-the-checks).

## Deploy on Vercel

1. [vercel.com](https://vercel.com), Add New, Project, then import the GitHub repository. Vercel detects Next.js and the defaults are right. Use Node 22 or later (the `engines` field of `package.json` asks for it).
2. Project Settings, Environment Variables: add the [web app variables](#web-app-variables) except `NEXT_PUBLIC_APP_URL`, which nothing reads: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GOOGLE_VISION_API_KEY`, `CRON_SECRET` and `VINTED_USER_IDS`. The `NEXT_PUBLIC_` values are inlined at build time: redeploy after changing one.
3. Deploy. [`vercel.json`](../vercel.json) schedules four crons, and Vercel runs them on the production deployment:

| Path | When (UTC) | What it does |
|---|---|---|
| `/api/prices/update?limit=700` | 08:00, 14:00 and 20:00 | Refreshes the prices of the 700 stalest cards. |
| `/api/prices/snapshot` | 23:55 | Writes the day's `price_history` rows. |

Vercel calls them with `GET` and `Authorization: Bearer <CRON_SECRET>`, which is why `CRON_SECRET` must exist on the project before the first scheduled run. The proxy lets both routes through without a session. To try them by hand:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://<your-app>.vercel.app/api/prices/update?limit=5"
curl -H "Authorization: Bearer $CRON_SECRET" "https://<your-app>.vercel.app/api/prices/snapshot"
```

What the routes do, and their other parameters, is in [COMMANDS.md](COMMANDS.md#http-endpoints-for-schedulers). The full schedule across Vercel, GitHub and `pg_cron` is in [ARCHITECTURE.md](ARCHITECTURE.md#schedules).

## GitHub Actions

Four workflows live in [`.github/workflows/`](../.github/workflows/). None of them runs tests. Each can also be started by hand: Actions tab, pick the workflow, Run workflow.

| Workflow | File | When (UTC) | What it does |
|---|---|---|---|
| Daily backup | [`backup.yml`](../.github/workflows/backup.yml) | 03:00 daily | `pg_dump --data-only` of 8 tables (`cards`, `lots`, `card_listings`, `lot_listings`, `user_profiles`, `config`, `ocr_usage_log`, `stock_value_snapshots`), gzipped and published as the pre-release `backup-daily-YYYY-MM-DD` (plus `backup-weekly-YYYY-Www` on Sundays and `backup-monthly-YYYY-MM` on the 1st). [`scripts/backup/rotate.sh`](../scripts/backup/rotate.sh) then keeps the latest 30, 12 and 12. |
| Refresh Cardmarket prices | [`cardmarket-prices.yml`](../.github/workflows/cardmarket-prices.yml) | 01:07 daily | `npm run upload-cardmarket-dumps`. |
| Scrape store events | [`store-events.yml`](../.github/workflows/store-events.yml) | every 30 minutes | Installs Chromium and runs `npm run scrape-events`. |
| Keep app warm | [`keep-warm.yml`](../.github/workflows/keep-warm.yml) | every 10 minutes, 06:00 to 23:59 | `GET <APP_URL>/login`, so the serverless function stays warm. |

Add these under Settings, Secrets and variables, Actions:

| Name | Kind | Value | Used by |
|---|---|---|---|
| `SUPABASE_DB_URL` | secret | The Postgres connection string of the **Session pooler** (dashboard, Connect), with the database password filled in. | `backup.yml` |
| `NEXT_PUBLIC_SUPABASE_URL` | secret | The project URL. | `cardmarket-prices.yml`, `store-events.yml` |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | The `service_role` key. | `cardmarket-prices.yml`, `store-events.yml` |
| `APP_URL` | repository **variable** | The production URL, such as `https://<your-app>.vercel.app`, not the Vercel dashboard URL. | `keep-warm.yml` |

`GITHUB_TOKEN` is injected by Actions; `backup.yml` declares the `contents: write` permission its `gh release` calls need.

Things to know before relying on them:

- **`SUPABASE_DB_URL` must be the Session pooler string.** The direct host `db.<ref>.supabase.co` has an IPv6 address only, which GitHub-hosted runners cannot reach.
- **The backup can succeed while saving nothing.** The dump step pipes `pg_dump` into `gzip` without `set -o pipefail`, so an unreachable database still ends in a green job and an empty archive ([TECH_DEBT.md](TECH_DEBT.md#the-scheduled-database-backup-uploads-empty-files-and-reports-success)).
- **The releases are public.** The repository is public, so once the dump works it publishes user data to anyone ([TECH_DEBT.md](TECH_DEBT.md#backups-are-published-as-releases-of-a-public-repository)). Read that item before you point `SUPABASE_DB_URL` at a working database. A private fork keeps its releases private.
- **`keep-warm.yml` does nothing without `APP_URL`.** It prints a warning and exits successfully, so the job looks green.
- **GitHub's schedules are best-effort.** Runs arrive late or are skipped ([TECH_DEBT.md](TECH_DEBT.md#githubs-schedules-dont-run-as-configured)).
- **Photos are not backed up** by any workflow ([what each backup covers](SUPABASE.md#backups-and-what-they-cover)).

## The Vinted agent

The bot that posts listings is a Python program that runs outside Vercel, on a machine that stays on (your own computer or a VPS). Nothing else in this guide depends on it, so skip it if you do not sell on Vinted. It needs:

- Python 3.10 or newer and its own virtual environment (`pip install -r requirements.txt` inside `vinted-agent/`).
- `vinted-agent/.env` with `SUPABASE_URL` and `SUPABASE_KEY` ([Agent variables](#agent-variables)).
- `vinted-agent/vinted_users.json`, which maps each Supabase user id to a cookies file and a display name. The ids are the ones in `VINTED_USER_IDS`; the format is in [DEPLOY.md](../vinted-agent/DEPLOY.md).
- A Vinted session per account. The `vinted_sessions` table is the source of truth: convert a browser export with `import_cookies.py` and paste it into the settings of `/vinted/bot`.
- A launcher: `start.sh` on WSL, `start-mac.sh`, `start-windows.ps1`, or the systemd unit for a VPS.

Run exactly one agent at a time: at start-up it puts the `processing` jobs of its accounts back to `pending`, so a second instance would run them again.

The agent's own [README](../vinted-agent/README.md) (in French) covers machine setup, cookies and the launchers, and [DEPLOY.md](../vinted-agent/DEPLOY.md) the VPS and systemd route. Its commands are listed in [COMMANDS.md](COMMANDS.md#the-vinted-agent).

## Run it locally without any keys

No Supabase project, no API key, no Vinted account. This needs Docker running, Node 22 or later, and the dependencies of the repository itself, because the tooling starts the root's Next.js and `tsx`.

```bash
npm install                  # at the repository root, if you have not already
cd SHOWCASE/capture
npm install                  # Playwright, the Supabase CLI and pg, installed in this folder only
node capture.mjs --serve
```

The command:

- starts a throwaway Supabase in Docker, built from the 71 migrations plus one extra first migration that enables `pg_cron`. Its ports are the repository's `supabase/config.toml` ports plus 1000 (API on 55321, database on 55322), so it never collides with a `supabase start` of the real project;
- loads sanitized fixtures: a snapshot of production data from 2026-10-10 with test accounts, fake Vinted ids, renamed opponents and no notes, plus the catalog snapshots from `backups/`;
- serves the app with `next dev` on `http://127.0.0.1:3100`, with every key that could reach an outside service blanked.

Sign in with one of the two test accounts in [`SHOWCASE/capture/fixtures/users.json`](../SHOWCASE/capture/fixtures/users.json); each entry holds an email and a password that exist only in this throwaway database.

Every page the README shows is recorded against these fixtures, so they all work: dashboard, Pokédex, stock, prices, the Vinted and bot pages, the PTCG module, the events calendar, options. The scanner does not: it needs a Gemini or Vision key, and in this mode there is none, so `/api/ocr` answers `ocr_failed`. (The recording script answers that one call from `fixtures/scan.json`, but only while it records shots.) No agent runs, so nothing is posted to Vinted.

Ctrl+C stops the app, but the Supabase containers keep running. `node stack.mjs stop`, in the same folder, removes them and their data. Running `--serve` again resets the database to the fixtures. The first run pulls the Supabase Docker images. If `supabase start` fails, check that Docker is running and run `node stack.mjs stop` before retrying.

The same tooling records the images of the README; see [Refreshing the README visuals](CONTRIBUTING.md#refreshing-the-readme-visuals) and [COMMANDS.md](COMMANDS.md#showcase-tooling).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `db push` stops with `schema "cron" does not exist` | `pg_cron` was not enabled before the push | Enable it (Database, Extensions) and run `db push` again. |
| `db push` talks to the wrong project or reports objects that already exist | The CLI is linked to another project, or some files were run by hand | Delete `supabase/.temp/` and run `npx supabase link --project-ref <PROJECT_REF>` again; run `migration repair --status applied <TIMESTAMP>` for the files applied by hand. |
| Sign-in is refused | The user is missing or unconfirmed, or `.env.local` holds the wrong project's URL or anon key | Check Authentication, Users; fix `.env.local` and restart `npm run dev`. |
| Names show as email addresses, or there is no partner | `user_profiles` rows are missing | [Insert the profiles](#insert-the-profiles). |
| `restore-catalog` stops at its first step | The RPC it calls does not exist | See the known issue under [Catalog and pricing data](#catalog-and-pricing-data). |
| `restore-cardmarket-index` fails with a foreign key violation | The products or expansions are not loaded yet | Run `upload-cardmarket-dumps` and `restore-cardmarket-expansions` first. |
| `/api/prices/update` answers 401 | `CRON_SECRET` is missing from Vercel, or the call carries another value | Set it in Project Settings and redeploy; check the cron's logs. |
| Scans fail with `ocr_failed` | Neither `GEMINI_API_KEY` nor `GOOGLE_VISION_API_KEY` is set, or the pinned Gemini model is gone | [Gemini and Google Vision keys](#gemini-and-google-vision-keys). |
| Cards of a recent set get no Cardmarket id or price | The set is not in `cardmarket_expansions.json` | `npm run update-expansions`, then commit the JSON (needs a valid BrightData token). |
| The Vinted buttons are missing, or `/vinted/bot` says it is not enabled | Your user id is not in `VINTED_USER_IDS` on that deployment | Add it, redeploy, sign in again. |
| The backup job is green but the release holds a 20-byte file | `pg_dump` failed and the pipe hid it | [GitHub Actions](#github-actions). |
| `npm run dev` serves stale pages or hot reload breaks | The `.next` cache is stale | Delete `.next` and start again. |
| The install banner never shows | It was dismissed (remembered for 14 days) or the app is already installed | Run `localStorage.removeItem('iris.pwa.installDismissedAt')` in the browser console, or use the install button in Options. |
