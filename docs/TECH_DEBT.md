# Tech debt

The catalog of what isn't right yet. Most items passed a deliberate cost-benefit check: the 1,460-line `CardScanForm` that still earns its size, the modals waiting on a primitive migration, the two hard-coded accounts of a two-person app. A few are not trade-offs at all but bugs or risks, found in the audit of 2026-10-10; those come first.

Each item says what it is, why it's still there, and what fixing it would take. File references are relative links; line numbers are approximate and drift.

---

## Fix first: data and privacy

### The scheduled database backup uploads empty files and reports success

[`.github/workflows/backup.yml`](../.github/workflows/backup.yml) runs `pg_dump … | gzip > dump.sql.gz` without `pipefail`. The direct host `db.<ref>.supabase.co` only has an IPv6 address, which GitHub-hosted runners can't reach, so `pg_dump` fails, `gzip` happily writes an empty archive, and the job is green. Every retained release (daily, weekly and monthly, back to June) holds a 20-byte `dump.sql.gz`. Today the only working database backup is the manual one on the Options page.

**Fix:** `set -euo pipefail` in the dump step, and the Session pooler connection string (IPv4) in the `SUPABASE_DB_URL` secret. **Before** turning it back on, read the next item: once the dump works, it would be published on a public repository.

**Estimated effort:** 30 minutes, plus the decision below.

### Backups are published as releases of a public repository

The workflow uploads each dump as a GitHub pre-release. The repository is public, so a working dump of `cards`, `user_profiles`, `ocr_usage_log` and the listing tables would be downloadable by anyone. Nothing leaked so far only because every dump is empty (see above).

**Fix:** encrypt the dump before upload (`age` or `gpg` with a key kept in a repository secret), or push it to the private `manual-backups` bucket instead of releases. Never add `vinted_sessions` (cookies) to the dumped tables.

### Backups cover 8 of 33 tables, and no photos

Both the workflow and the manual backup ([`app/api/backup/manual/route.ts`](../app/api/backup/manual/route.ts)) dump the same 8 tables. Missing: every `ptcg_*` table, `other_items`, the Vinted bot's queue, schedule and settings, `price_history`, `audit_logs`, and the four storage buckets (card, lot and item photos). The confirmation dialog still says "a full snapshot of all your data".

**Fix:** derive the table list from the schema instead of a hard-coded list (excluding `vinted_sessions` and the catalog tables, which are restorable from `backups/`), and sync the photo buckets to a backup bucket.

**Estimated effort:** half a day.

### Card photos keep their GPS position, in public buckets

[`lib/utils/resize-image.ts`](../lib/utils/resize-image.ts) and [`lib/utils/image-postprocess.ts`](../lib/utils/image-postprocess.ts) deliberately keep the original EXIF (make, model, date) so uploads look like phone photos — and that includes GPS coordinates when the phone recorded them. `card-photos`, `lot-photos` and `other-item-photos` are public-read buckets.

**Fix:** drop the GPS IFD while keeping the rest of the EXIF, in both helpers; optionally rewrite existing photos with a one-off script.

**Estimated effort:** 1-2 hours.

### Items leak to the other account through the activity log

Items (`other_items`) are meant to be invisible to the partner: RLS and restrictive policies hide them everywhere. But `audit_logs` is readable by every signed-in user, and the item routes ([`app/api/other-items/route.ts`](../app/api/other-items/route.ts), [`app/api/other-items/[id]/route.ts`](../app/api/other-items/[id]/route.ts)) and the agent ([`vinted-agent/main.py`](../vinted-agent/main.py)) write the item's name, price and title into its details, which `/logs` shows.

**Fix:** a restrictive policy on `audit_logs` rows whose `entity_type` is `other_item`, scoped to their owner, or leave the details out for those rows.

**Estimated effort:** 30 minutes plus a migration.

---

## Bugs found in the audit

Small, concrete, each with its file. None blocks daily use; all are worth a commit.

- **Lots in Chinese are rejected.** [`app/api/lots/route.ts`](../app/api/lots/route.ts) whitelists `ZH`, written before the ZH → CN rename, while the form offers `CN`: a Chinese lot or single gets a 400.
- **The batch scanner ignores HTTP errors.** [`components/submit/BatchForm.tsx`](../components/submit/BatchForm.tsx) never checks `res.ok` on `/api/ocr` and `/api/enrich`; an error payload is treated as a result (confidence "NaN %", no "no catalog match" warning).
- **A dead end after the duplicate-photo dialog.** `resubmitAfterPhotoDecision` in [`components/submit/CardScanForm.tsx`](../components/submit/CardScanForm.tsx) sets the saving state and never resets it on a 409, so the next dialog (Pokédex swap, already for sale) opens with every control disabled.
- **The Pokédex swap from the scanner isn't atomic.** It demotes the old card with a PATCH, then posts the new copies one by one, uploading the photo each time. If an insert fails after the demotion, the slot stays empty. The Pokédex page itself uses the atomic `replace_pokedex_card` function; the scanner should too.
- **Photo paths differ between the two save routes.** [`app/api/cards/route.ts`](../app/api/cards/route.ts) stores `card-photos/{cardId}.jpg`, the batch route a random uuid, and `DELETE /api/cards/[id]` only removes `{id}.jpg`. Batch photos are never cleaned up, and deleting a card can remove a file its clones still point to.
- **A sold card can be put back in Stock.** The listing dialog opened from the « Vendus » pile offers « Re-ranger en stock » without checking the status ([`components/vinted/AnnonceModal.tsx`](../components/vinted/AnnonceModal.tsx)).
- **The activity log has a hydration mismatch.** [`components/logs/LogsClient.tsx`](../components/logs/LogsClient.tsx) formats dates with `toLocaleString(undefined, …)`, so the server (UTC, its own locale) and the browser (French, Paris) render different text and React re-renders the whole tree.
- **Stats ignore result corrections.** [`app/(app)/ptcg/stats/page.tsx`](../app/(app)/ptcg/stats/page.tsx) re-reads each result from the raw log, so a win/loss corrected in the edit dialog never reaches the stats.
- **Re-pasting a battle log already imported** returns the existing row, drops the dialog's corrections, and the page prepends a duplicate entry.
- **Drill profiles can't use a Mega sprite** (the API rejects dex numbers above 1025, which is how Megas are encoded), and **drill images for subset cards** (`LOR-TG-24`) are never found because [`lib/ptcg/drill-resolve.ts`](../lib/ptcg/drill-resolve.ts) splits ids on the first hyphen.
- **Top movers list every copy of a card.** On `/prices`, three copies of the same print fill three rows of the top 10.
- **Some Cardmarket image prefixes are wrong.** For a few expansions the stored prefix (for example `P` for Sun & Moon promos) isn't the one Cardmarket's image server uses, so `/api/cm-img` gets a 403 and the catalog image stays blank.
- **The bot page looks up its whole queue in one URL.** The monitoring hook puts every queued card id in a single `in.(…)` filter; around 450 ids make a 17 KB URL. The hosted gateway accepts it today; a local Supabase (Kong) rejects anything over about 8 KB. `chunkArray` from [`lib/api/fetch-all.ts`](../lib/api/fetch-all.ts) fixes it.
- **The agent's windows follow the machine's clock.** [`vinted-agent/main.py`](../vinted-agent/main.py) uses a naive `datetime.now()`: on a server set to UTC the posting windows shift by one or two hours.
- **Three scripts still read only the first 1,000 rows.** `recommend-scrape-targets`, `reenrich-cards` and `check-supabase-state` query whole tables without [`fetchAllRows`](../lib/api/fetch-all.ts), so they silently work on a truncated list.
- **Two agents at once re-run jobs.** On startup the agent resets every `processing` job to `pending`, so a second instance (home PC and VPS) re-runs the first one's job.

---

## Component size

### `CardScanForm.tsx`: 1,460 lines, 25 `useState` calls

The heart of the scan flow. UI pieces (`Field`, `Input`, `Select`, `CandidatePicker`) live in `CardScanFormUI.tsx`, but the orchestration is still monolithic.

**Natural decomposition** (the main component would drop to about 600 lines):
- `usePhaseMachine()`: the `idle → scanning → reviewing → saving → success | error` phase and its transitions;
- `useOcrPipeline()`: OCR text, usage, engine, plus `runOcr()`;
- `useEnrichment()`: candidates, re-search state, plus `runEnrich()` and `applyEnriched()`;
- `useConflictDialogs()`: the duplicate-photo, already-for-sale and Pokédex-swap dialogs.

**Why deferred:** the file works in production and has subtle inter-state dependencies (a candidate pick can re-trigger enrichment, which resets the suggestion). A regression in the most-used flow costs more than the refactor saves, as long as the file isn't being changed often.

**Estimated effort:** 3-4 hours of focused work, with the dev server side by side.

### `VintedList.tsx`: about 1,100 lines

The sold → restock → promote → partner-cleanup chain, the bulk sale, the bulk trade and the bulk post/bump all live inline in [`components/vinted/VintedList.tsx`](../components/vinted/VintedList.tsx).

**Natural extraction:** `useVintedSoldFlow()` and `useBulkActions()`, returning the dialogs' state and handlers.

**Why deferred:** the chain has an implicit order (the partner cleanup only fires after the promote dialog is dismissed; the bulk variant queues them) that's awkward to express in a hook signature without leaking it.

**Estimated effort:** 1-2 hours.

### Near-duplicate dialogs

`LotAnnonceModal` and `OtherItemAnnonceModal` are about 360 near-identical lines; the listing templates exist twice, in TypeScript ([`lib/utils/vinted-template.ts`](../lib/utils/vinted-template.ts), [`lib/utils/lot-template.ts`](../lib/utils/lot-template.ts)) and in the agent's Python ([`vinted-agent/main.py`](../vinted-agent/main.py)), and have drifted (the title fallback ladder has six steps in TypeScript, five in Python), so the in-app preview can differ from what is posted.

**Fix:** one shared "listing sheet" component; and either generate the agent's templates from the TypeScript ones or have the app write the final title and description into the job row so the agent posts exactly what was previewed.

---

## Modal primitive migration

The `<Modal>` primitive ([`components/ui/Modal.tsx`](../components/ui/Modal.tsx)) handles the backdrop, Escape, click-outside and the body scroll lock. A handful of dialogs use it; about twenty overlays still roll their own (`AnnonceModal`, `BulkSoldModal`, `BulkSoldRecapModal`, `LotAnnonceModal`, `OtherItemAnnonceModal`, `MoveToPokedexModal`, `DuplicatePhotoModal`, `DuplicateForSaleModal`, `PokedexCardActionsModal`, `PokedexReplaceModal`, the bot's settings and logs dialogs, the PTCG dialogs…).

**Each migration is mechanical:** replace the wrapper `<div className="fixed inset-0 …">`, the Escape handler and the click-outside with `<Modal open onClose ariaLabel>`. About 10 minutes per file; the risk is per-file layout.

**Why deferred:** no user-visible change. Touch them when the surrounding code needs work anyway. `PokedexDrawer` stays custom on purpose: a bottom sheet on mobile that becomes a side drawer on desktop doesn't fit the primitive.

---

## Two hard-coded accounts

The owner's and the partner's user ids are hard-coded in 17 files: the Items policies and the migrations around them, [`lib/vinted/other-item-queue-sync.ts`](../lib/vinted/other-item-queue-sync.ts), the dashboard's sales tiles and the activity log's badges (with first names), the agent's helper scripts. Meanwhile `user_profiles` and the user context already carry the display names.

**Why deferred:** I.R.I.S has exactly two users, and making a third one possible is not a goal (see *Won't do*).

**Fix when it matters:** an `owner` flag or role on `user_profiles`, read by the policies through a SQL function, and the display names everywhere else.

---

## Identity and data model

- **`card_id_tcg` has three formats.** Strategy 0 of the enrichment writes `BRS-12`, a number-less Cardmarket match `cm-123`, TCGdex `30th-004` or `SV2a-001`. It is the key of duplicate detection, shared photos and the one-for-sale rule, so the same card matched two different ways is two different cards. **Fix:** normalise to one format (Cardmarket id when known) and backfill.
- **Four definitions of "the same card group"** disagree for uncatalogued cards: [`lib/utils/group-cards.ts`](../lib/utils/group-cards.ts), the empty-string fallbacks in the Stock page and the promote detection, the database index, and the PATCH pre-check.
- **Columns written but never read:** `ptcg_games.my_archetype` / `opponent_archetype` (and their index), the key-card columns, `validation`; `ptcg_analyses` is written by the API but read by nothing since the replay page was removed (2026-09-16); `config.vinted_shipping_note` and `vinted_seller_note`; `NEXT_PUBLIC_APP_URL` in `.env.example`.
- **`PARSER_VERSION` is still `1.0.0`** ([`lib/ptcg/index.ts`](../lib/ptcg/index.ts)) after six parser-changing commits, and there is no backfill tool for `went_first` or the deck columns.
- **The pricing cron's index no longer fits its query:** the partial index covers `status = 'for_sale'`; the cron now scans three statuses.

---

## Dead code

Each is imported only by its own test, or not at all: `components/submit/LotForm.tsx`, `components/dashboard/RestockAlertsList.tsx`, `components/ui/Pokeball.tsx`, `components/ui/VintedLogo.tsx`, `lib/vinted/pipeline-split.ts`, `lib/utils/parse-set-number.ts`, `lib/utils/json-from-text.ts`, `lib/utils/ptcg-preview-position.ts`, `lib/ptcg/parse-quality.ts`; the route `/api/cards/[id]/photo` has had no caller since May; `SaveSuccessModal` can no longer render; the unused TCGdex helpers (`lookupSubseries`, `probeSubseriesByDex`, `enrichWithFrenchNames`, `listSets`, `findCardsByTotalAndLocalId`).

**Fix:** delete them with their tests. Trivial; done in one commit the next time I'm in the area.

---

## Translations

- **Hard-coded French** in a four-language app: the dashboard's sales tiles and widgets, the whole bot monitoring page, event dates and month names, the Pokédex suggestion messages, a few placeholders.
- **Orphan keys:** 26 `ptcg.*` keys from the replay era, unused `ptcgStats` and `dashboard` keys; `ja` and `zh` carry 12 old `ptcgStats.*` keys and lack `ptcg.resultFieldLabel`, so that label shows as a raw key in Japanese and Chinese.

**Fix:** move the strings into `messages/*.json` (with `en.json` as the typed source) and prune the orphans with a script that diffs the keys used in code against the files.

---

## Testing

### No CI

No workflow runs the tests, the type check or the linter. Everything runs by hand before a push: 1,401 Vitest tests, 153 pytest tests, `tsc`, ESLint.

**Fix:** a `ci.yml` running `npm ci`, `npm test`, `npm run typecheck`, `npm run lint` and the agent's pytest on every push to `prod`.

**Estimated effort:** 1 hour.

### No end-to-end tests

The critical flows (scan → enrich → save, sold → restock → promote, bulk sale, posting a job) are covered by unit and route tests and by manual runs, not by a browser suite. Untested at any level: the `/api/ocr`, `/api/enrich`, `/api/cards/batch`, clone, `cm-img`, Pokédex swap and listings routes, and the biggest components (`CardScanForm`, `BatchForm`, `VintedList`, `PtcgDrill`).

**Why deferred:** the external APIs (Gemini, Cardmarket, TCGdex, Vinted) are non-deterministic, and mocking them well enough meant rebuilding half the backend. That changed with the showcase tooling: [`SHOWCASE/capture/`](../SHOWCASE/capture/) already runs the real app against a local Supabase seeded from fixtures, with the OCR answered from a file. Turning its scripted flows into Playwright tests is now mostly assertions.

### Slow agent tests

Some `other_item` tests in `vinted-agent/main_test.py` don't mock `asyncio.sleep` and really wait for the posting delays: the suite takes about 85 seconds for 153 tests.

---

## Pricing and catalog

### New sets aren't imported: the BrightData token expired

`npm run update-expansions` needs BrightData to read Cardmarket's expansion list, and the token expired on 2026-10-05. Meanwhile [`cardmarket_expansions.json`](../cardmarket_expansions.json) still lists the 741 expansions of May: the nightly import logs 44 unknown expansion ids and drops about 5,800 products, including the 30th Celebration. Those cards are identified through TCGdex but carry no Cardmarket id or price.

**Fix:** renew the token, run `npm run update-expansions`, commit the JSON.

### The scraped index covers about 71 % of expansions

`cardmarket_card_index` (48,699 rows) comes from the BrightData scraper in [`scrapers/cardmarket/`](../scrapers/cardmarket/), see [CARDMARKET_MAPPING.md](CARDMARKET_MAPPING.md). Expansions without gallery pages fall back to name-prefix matching in [`lib/api/cardmarket-pricing.ts`](../lib/api/cardmarket-pricing.ts), which is rarely hit now.

### Skipped cards look freshly priced

Cards the cron can't price (special variants, missing identifiers) get their `cm_updated_at` touched so they stop blocking the oldest-first queue — which also makes their freshness badge say "< 1 day" when their price wasn't refreshed.

**Fix:** a separate `cm_checked_at` column for the queue, leaving `cm_updated_at` to real refreshes.

---

## Operations

### GitHub's schedules don't run as configured

`keep-warm.yml` asks for a run every 10 minutes from 06:00 to 23:59 UTC and gets about five a day; `store-events.yml` asks for every 30 minutes and gets about five; the backup and the Cardmarket job land hours late. Scheduled workflows on GitHub-hosted runners are best-effort.

**Fix:** move keep-warm to Vercel Cron or an external pinger, and accept the drift for the rest (or trigger them from Vercel Cron with `workflow_dispatch`).

### Two event sources are stale

The Troll2Jeux extractor times out on every CI run (`waitUntil: 'networkidle'`), and the job stays green because one failing shop never fails the run. Le Coin des Barons' events are typed in by hand and only cover July and August.

### No per-user quota on `/api/ocr` and `/api/enrich`

Both routes require a session but apply no per-user throttle; a signed-in user could run up the Gemini bill.

**Why deferred:** two known users, and the dashboard shows the OCR cost per day, so an anomaly is visible the same evening.

**Fix when broadening the user set:** sum `cost_eur` from `ocr_usage_log` for the user over the last 24 hours and answer 429 above a ceiling.

### The coach's documentation points to a removed page

[`.claude/skills/ptcg-coach/SKILL.md`](../.claude/skills/ptcg-coach/SKILL.md) and [`docs/ptcg-coach-project/`](ptcg-coach-project/) still tell the user to upload analyses at `/ptcg/import`, removed on 2026-09-16, and `scripts/ptcg-bundle.ts` expects a bare analysis while the skill now outputs a `{raw, analysis, playedAt}` wrapper. Editing the skill also means rebuilding its zip (`npm run skill-zip`), or `scripts/skill-zip.test.ts` fails.

---

## Fixed in the audit of 2026-10-10

- **The migration chain didn't replay on a fresh database.** [`20260504000000_rename_zh_to_cn.sql`](../supabase/migrations/20260504000000_rename_zh_to_cn.sql) used the new `CN` enum value in the transaction that added it (SQLSTATE 55P04), so `supabase db reset` stopped at the 7th migration. The update now runs as dynamic SQL, only when there is a row to move. The hosted project is unaffected: the CLI tracks applied versions, not file contents.
- **The Drill showed no card art since 2026-09-14.** When decklists started resolving against `tcg_catalog`, the images became complete LimitlessTCG files, but the Drill kept appending TCGdex's `/low.webp` suffix, so every image 404'd and fell back to a text tile. [`lib/ptcg/drill-image.ts`](../lib/ptcg/drill-image.ts) now appends it only to extension-less TCGdex URLs.
- **`restore-catalog` failed on a fresh project.** With no `truncate_tcg_catalog` RPC (no migration creates it), its fallback deletes compared the uuid `id` with `0` and the enum `rarity` with `''`, which Postgres rejects; they now match every row with `is not null`.
- **Lint back to zero:** two unused variables and a stale `eslint-disable` in test files, and the category picker's input now has the `combobox` role its `aria-expanded` needs.
- **The documentation:** every doc in `docs/` rewritten or updated against the code; the one-off plans and specs of May removed.

---

## Won't do

What stays out of scope, unless the project grows beyond its two users:

- **Public sign-up.** Auth is a whitelist by design: two accounts created at install.
- **Native mobile apps.** The PWA covers the use case; native would mean more codebases for the same screens.
- **An in-browser image editor.** A photo is accepted or retaken; no crop, rotate or filters.
- **OCR for other card games.** Lots and Items cover Lorcana, One Piece, Magic and Riftbound by hand; the catalog, the prompt and the matching strategies are Pokémon-specific, and generalising them would mean rebuilding the enrichment pipeline.
- **Cardmarket marketplace integration.** The API is closed to new applicants; I mirror the public dumps for prices and don't buy or sell through Cardmarket programmatically.
- **A restore UI.** Restoring is rare and dangerous; a CLI path that has to be run on purpose is the safer trade-off for two users.

---

## Assessment

The app is used daily for what it was built for. The bugs above are small and local; the risks are concentrated in one place, the backups, and fixing them is an afternoon. The rest is incremental polish (component splits, modal migrations, translations) or deliberate trade-offs of a two-person app.

For a portfolio reader, this page is the answer to *"what would you fix if you had another two weeks?"*, and the implicit answer to *"do you know when to stop?"*.
