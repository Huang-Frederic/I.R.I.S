# Setup guide

Provisioning takes about 30–45 minutes if you have all the API keys lined up — most of that is the catalog scrape running in the background. This guide walks you through the full stack: Supabase project creation, Google Vision and Gemini keys, database migrations, catalog population, and the optional Cardmarket gallery scrape. By the end you'll have a running PWA with multilingual OCR, live pricing, and automated daily cron jobs.

If you just want the abridged "clone-and-run" path, see the **Quick start** section in the [main README](../README.md#-try-it-yourself). This doc is the detailed walkthrough.

## Table of contents

1. [📋 Prerequisites](#1--prerequisites)
2. [🟢 Supabase project](#2--supabase-project)
3. [👁 Google Cloud Vision (OCR fallback)](#3--google-cloud-vision-ocr-fallback)
4. [✨ Gemini API (primary OCR)](#4--gemini-api-primary-ocr)
5. [🌱 Environment variables](#5--environment-variables)
6. [🗄 Database migrations](#6--database-migrations)
7. [📚 Populate the offline catalog](#7--populate-the-offline-catalog)
8. [💰 Pull Cardmarket pricing dumps](#8--pull-cardmarket-pricing-dumps)
9. [🔍 Optional: scrape Cardmarket gallery for fast lookups](#9--optional-scrape-cardmarket-gallery-for-fast-lookups)
10. [🚀 Run the app](#10--run-the-app)
11. [🌐 Production deployment (Vercel)](#11--production-deployment-vercel)
12. [🔧 Troubleshooting](#12--troubleshooting)

---

## 1. 📋 Prerequisites

You'll need Node 22, the Supabase CLI (used via `npx`), and a browser that supports PWA install. Here's the checklist.

| Tool | Version | Notes |
|---|---|---|
| **Node.js** | `>=22.0.0` | Use [`nvm`](https://github.com/nvm-sh/nvm): `nvm install 22 && nvm use 22`. The repo's `package.json` engines field enforces this. |
| **npm** | bundled with Node 22 | |
| **Git** | any | |
| **Supabase CLI** | latest | Used as `npx supabase ...`, no global install needed. |
| **psql** *(optional)* | any | For direct DB inspection / debugging. The Supabase dashboard SQL editor is a viable alternative. |
| **A browser with PWA support** | Chrome / Edge / Safari iOS | For the install banner. |

---

## 2. 🟢 Supabase project

You'll need a Supabase project to host the database, storage, and auth. This is the foundation — everything else depends on it. **~5 minutes**, blocking for everything else.

### 2.1 Create the project

1. Go to [https://supabase.com](https://supabase.com), sign in (Google / GitHub OK).
2. **New project**:
   - **Name** — `iris` or anything you want
   - **Database password** — let Supabase generate a strong one and **save it** (you'll need it for the CLI)
   - **Region** — pick the one closest to your Vercel region (`Frankfurt eu-central-1` works well in EU)
   - **Plan** — Free is enough for personal use
3. Wait 2–3 minutes for provisioning.

### 2.2 Grab the API keys

Project Settings → **API**. Copy these three values into your `.env.local` (we'll create it in step 5):

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Project URL** (e.g. `https://abc123xyz.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Project API keys → anon public** |
| `SUPABASE_SERVICE_ROLE_KEY` | **Project API keys → service_role secret** ⚠️ never exposed client-side, never committed |

### 2.3 Create the user accounts

The app is designed for **two users** (whitelist auth, no public signup).

1. **Authentication → Users → Add user → Create new user**, twice.
2. Use real email addresses. Disable "Send invite email" (you'll set passwords yourself).
3. Note both `user_id` values shown after creation — you'll need them in step 6.
4. **Authentication → Settings** → uncheck "Enable email signups". This locks new account creation.

### 2.4 Storage buckets

The migrations will create the `card-photos`, `lot-photos`, and `manual-backups` buckets automatically. No manual action needed here.

---

## 3. 👁 Google Cloud Vision (OCR fallback)

Vision is the OCR fallback. You only need it if Gemini's quota runs out — but provisioning it now is cheaper than scrambling later. **~5 minutes**, required as the OCR safety net when Gemini fails.

### 3.1 Project + billing

1. [Google Cloud Console](https://console.cloud.google.com) → create a new project named `iris` (or reuse one).
2. **Billing → Link a billing account**. Vision API is free up to 1,000 units/month, but Google requires a valid billing account even for the free tier.

### 3.2 Enable the API + create a key

1. **APIs & Services → Library** → search "Cloud Vision API" → **Enable**.
2. **APIs & Services → Credentials → + Create credentials → API key**.
3. Copy the key into `.env.local`:
   ```env
   GOOGLE_VISION_API_KEY=AIzaSy...
   ```
4. **Recommended**: edit the key → restrict to **Cloud Vision API** only.

---

## 4. ✨ Gemini API (primary OCR)

Gemini is your primary OCR engine — it's what gets you to 93% accuracy. Vision is the backup, but Vision-only lookups drop to ~63% match rate. **~3 minutes**, required for the 93% accuracy bench.

### 4.1 Get a Gemini API key

1. [Google AI Studio API keys](https://aistudio.google.com/app/apikey) → **Create API key**.
2. Attach it to your existing GCP project (the one from step 3) to centralize billing.
3. Copy into `.env.local`:
   ```env
   GEMINI_API_KEY=AIzaSy...
   ```

### 4.2 Enable Tier 1 billing (optional but recommended)

The free tier limits to 5 requests/min — too low for repeated scanning. Enabling billing on the GCP project automatically promotes you to **Tier 1** (15 req/min, plenty for one-card-at-a-time use).

Estimated cost: **~€0.0004 per scan** (input ~360 tokens + output ~50 tokens). At 100 scans/month, that's around **6 cents**.

### 4.3 Model pinning

The code uses `gemini-3.1-flash-lite-preview` (pinned in [`lib/api/gemini-vision.ts`](../lib/api/gemini-vision.ts)). Validated via [`scripts/bench-multi-model.ts`](../scripts/bench-multi-model.ts) at 5/5 accuracy with −43% cost vs `gemini-3-flash-preview`.

It's a **preview** model — Google may rename or retire it. If OCR starts returning empty results, re-bench with `npx tsx scripts/bench-multi-model.ts` and update the model ID.

The `thinkingConfig: { thinkingBudget: 0 }` setting is critical for Gemini 3.x reasoning models — without it the output token budget is consumed by invisible thinking and the response is truncated.

---

## 5. 🌱 Environment variables

Now you'll wire up the keys you collected in steps 2–4. Create a `.env.local` at the repo root (it's gitignored). Final shape:

```env
# Supabase (step 2)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# OCR (steps 3–4)
GOOGLE_VISION_API_KEY=AIzaSy...
GEMINI_API_KEY=AIzaSy...

# Cron protection — generate a 32-byte random hex
CRON_SECRET=$(openssl rand -hex 32)

# Local dev
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> Generate the cron secret with `openssl rand -hex 32` and paste the output. The same value goes into Vercel's environment variables for production cron protection (step 11).

---

## 6. 🗄 Database migrations

With your Supabase project live and env vars in place, it's time to create the schema. All migrations live in [`supabase/migrations/`](../supabase/migrations/) and apply in chronological order.

### Option A — Supabase CLI (recommended)

```bash
npx supabase login                                  # one-time, opens browser
npx supabase link --project-ref <PROJECT_REF>       # PROJECT_REF = abc123xyz from your Supabase URL
npx supabase db push                                # applies every migration in order
```

### Option B — SQL Editor

Open each `.sql` file in `supabase/migrations/` (alphabetically) and paste into the Supabase dashboard SQL Editor. Slower but works without the CLI.

### After applying

Update the `user_profiles` table to map the two auth users to display names:

```sql
update user_profiles set display_name = 'Lui'  where user_id = '<user-1-uuid>';
update user_profiles set display_name = 'Elle' where user_id = '<user-2-uuid>';
```

(Replace `Lui` / `Elle` with the names you want shown across the app, and the UUIDs from step 2.3.)

For the full migration breakdown, see **[docs/SUPABASE.md](SUPABASE.md)**.

---

## 7. 📚 Populate the offline catalog

The app's enrichment pipeline queries a local Postgres catalog of ~52K cards (JP + EN + FR + illustrator) before falling back to TCGdex live API. This step downloads and indexes the entire catalog. **~12 minutes** without illustrator, **~3 hours** with full illustrator scrape.

```bash
npm install                                         # if not done already
npx tsx scripts/scrape-limitlesstcg.ts              # base scrape, no illustrator
# OR
SCRAPE_ILLUSTRATOR=1 npx tsx scripts/scrape-limitlesstcg.ts   # full scrape with illustrator
```

> The illustrator field is used by the enrichment pipeline to disambiguate between print variants (RR base vs AR alternate art) when multiple cards share the same set number. Worth the extra time.

The scraper is **resume-safe** (skips sets already complete). If it fails mid-run, just relaunch.

**WSL2 / Node 22 SSL issue?** If you see `UNABLE_TO_VERIFY_LEAF_SIGNATURE`:
```bash
export INSECURE_HTTPS=1
npx tsx scripts/scrape-limitlesstcg.ts
```

Verify:
```sql
select language, count(*) from tcg_catalog group by 1 order by 1;
-- expected: ~7 rows (de, en, es, fr, it, jp, pt) totaling ~111000
-- (note: DE/IT/ES/PT were wiped in Phase 3c; you may see only jp/en/fr ~52K)
```

---

## 8. 💰 Pull Cardmarket pricing dumps

Cardmarket publishes their full product catalog and pricing as public S3 JSON dumps (refreshed nightly). You'll mirror them into `cardmarket_expansions`, `cardmarket_products`, and `cardmarket_pricing` tables — no API key needed.

```bash
npm run upload-cardmarket-dumps
```

**~30 seconds**, downloads ~26 MB from S3 and bulk-upserts to Supabase. The same script runs daily via GitHub Action ([.github/workflows/cardmarket-prices.yml](../.github/workflows/cardmarket-prices.yml)).

Verify:
```sql
select count(*) from cardmarket_products;     -- expected: ~67,650
select count(*) from cardmarket_pricing;      -- expected: ~67,650
```

---

## 9. 🧮 Build the `cardmarket_card_index` (SQL formula, not scraping)

The exact `(expansion, set_number, variant) → idProduct` index is derived **directly from the dump** by a deterministic SQL formula — no scraping, no Cloudflare risk. Run this once after the first dump upload (step 8) and any time the dump adds new expansions.

```sql
-- Run in Supabase SQL editor
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
SELECT g.id_product, g.id_expansion,
  DENSE_RANK() OVER (PARTITION BY g.id_expansion ORDER BY g.card_group_idx)::text,
  CASE WHEN COUNT(*) OVER (PARTITION BY g.id_expansion, g.card_group_idx) > 1
    THEN 'V' || ROW_NUMBER() OVER (PARTITION BY g.id_expansion, g.card_group_idx ORDER BY g.id_product)::text
    ELSE NULL END,
  'fr', NULL
FROM grouped g;
```

Populates ~67k product mappings across 738 expansions in seconds. Validated against 5 manually-scraped sets (3 perfect matches, 2 wheel-type promos correctly skipped). Full discovery, caveats, and validation results in [`docs/cardmarket-mapping.md`](cardmarket-mapping.md).

### Advanced: scrape Playwright gallery for wheel-type promo sets

For the rare wheel-type promo sets where the formula doesn't apply (Battle Party Set, Void Blast — collector range 0–9 with non-deterministic ordering), use the Playwright scraper:

```bash
npm run scrape-cardmarket -- <slug-of-the-wheel-set>
```

Run from a clean residential IP. Cardmarket's Cloudflare protection is aggressive and a full `--all` run is **not recommended** — the SQL formula above replaces it. See [`scripts/scrape-cardmarket-cards.ts`](../scripts/scrape-cardmarket-cards.ts) header for the anti-bot posture (rebrowser-playwright, 15s/page, kill switch at 2 cumulative 429s).

---

## 10. 🚀 Run the app

You're ready to launch. Here's how to run locally, including the HTTPS mode you'll need for camera scanning on mobile.

```bash
npm run dev                                         # http://localhost:3000
```

Sign in with one of the Supabase users from step 2.3.

To test camera scanning from a phone, you need HTTPS:
```bash
npx next dev --experimental-https                   # auto-generates a self-signed cert
```
Accept the certificate warning in the browser. The phone needs to be on the same Wi-Fi as your machine; access via the local IP shown in the terminal.

---

## 11. 🌐 Production deployment (Vercel)

When you're ready to ship, Vercel automates the build, cron scheduling, and environment variable management. Here's the click-path.

### 11.1 Connect repo

1. [vercel.com](https://vercel.com) → **Add New → Project** → import the GitHub repo.
2. Vercel auto-detects Next.js. Default build settings are correct.

### 11.2 Environment variables

Project Settings → **Environment Variables** → add **all** the keys from your `.env.local` (steps 5):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_VISION_API_KEY`
- `GEMINI_API_KEY`
- `CRON_SECRET`
- `NEXT_PUBLIC_APP_URL` → your Vercel production URL (e.g. `https://iris.vercel.app`)

### 11.3 Cron jobs

The repo includes [`vercel.json`](../vercel.json) which schedules the daily pricing refresh:

```json
{ "crons": [{ "path": "/api/prices/update", "schedule": "0 2 * * *" }] }
```

Vercel reads this on deploy. The endpoint authenticates via the `CRON_SECRET` Bearer token. No additional setup needed — first deploy enables the schedule.

### 11.4 GitHub Actions (database backup)

The repo includes [`.github/workflows/backup.yml`](../.github/workflows/backup.yml) which runs `pg_dump` daily at 03:00 UTC and publishes a gzipped release tagged `backup-daily-YYYY-MM-DD`.

To enable:
1. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - `SUPABASE_DB_URL` → connection string from Supabase dashboard (Settings → Database → Connection string → URI mode)
2. Manually trigger once via the **Actions** tab to verify.

### 11.5 Cardmarket dumps cron

[`.github/workflows/cardmarket-prices.yml`](../.github/workflows/cardmarket-prices.yml) runs daily at 01:07 UTC. Same setup as backup: it requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as repo secrets.

---

## 12. 🔧 Troubleshooting

Common setup issues and their fixes. If you hit something not listed here, check the [CHANGELOG.md](CHANGELOG.md) for recent known issues from each phase.

| Symptom | Cause | Fix |
|---|---|---|
| `db push` fails on migration 1 (`relation already exists`) | Local `.supabase/` cache points to a different project | `rm -rf .supabase && npx supabase link --project-ref <correct-ref>` |
| `db push` fails on a migration but earlier ones applied | Some migrations were applied manually via SQL Editor | `npx supabase migration repair --status applied <TIMESTAMP>` for each already-applied migration |
| Login returns 401 | Auth user not created or wrong env vars | Verify users exist in **Supabase → Authentication → Users**; reload `.env.local` |
| `tcg_catalog` empty after scrape | Silent scrape error (timeout, cert) | Re-run with `INSECURE_HTTPS=1`, check script output |
| `/api/prices/update` returns 500 | `cardmarket_*` tables missing | Run `npm run upload-cardmarket-dumps` |
| Cardmarket scrape hits HTTP 429 | Rate-limited by Cardmarket | Stop, wait 15–30 min, restart. Use targeted scrape (see step 9) instead of `--all`. |
| OCR returns empty repeatedly | Gemini preview model retired | Re-bench with `bench-multi-model.ts`, update model ID in [`gemini-vision.ts`](../lib/api/gemini-vision.ts) |
| `npm run dev` hot-reload breaks | Next.js cache stale | `rm -rf .next && npm run dev` |
| PWA install banner doesn't show | Already dismissed (14-day TTL) or already installed | `localStorage.removeItem('iris.pwa.installDismissedAt')` in DevTools console; or use the manual install button in **Options** |

For deeper troubleshooting (specific test failures, type errors), check the **[docs/CHANGELOG.md](CHANGELOG.md)** for recent issues each phase encountered.
