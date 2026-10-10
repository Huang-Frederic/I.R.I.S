# Contributing to I.R.I.S

How this repository is worked on, for a person or an AI agent starting from scratch. The code map is in [ARCHITECTURE.md](ARCHITECTURE.md), the first-time install in [SETUP.md](SETUP.md), the database in [SUPABASE.md](SUPABASE.md), every script in [COMMANDS.md](COMMANDS.md), and what is known to be wrong in [TECH_DEBT.md](TECH_DEBT.md). This page holds the rules and the routines.

## Ground rules

- **Branch.** Work on `prod`, the default branch. Never push to `main`.
- **Commit messages.** One sentence, in the imperative mood, written as `type(scope): subject`, the way `git log` already reads:

  ```
  feat(cards): open a French card's Cardmarket link on its French offers (language=2)
  fix(db): make the 2026-10-05 migrations safe to re-run, so a later db push can't remap condition ids twice
  docs(vinted-agent): add a VPS/systemd deployment guide, env template, and service unit
  ```

  The types in use are `feat`, `fix`, `docs`, `test`, `chore`, `refactor`, `style`, `perf` and `build`. The scope names the area (`vinted`, `vinted-agent`, `ptcg`, `db`, `cards`, `events`, ...) and is left out for repo-wide changes (`docs: ...`).
- **No `Co-Authored-By` trailer.** The owner asked for none. Agent tooling often appends one by default: remove it. Some older commits carry it; don't copy them.
- **Subagents run on Sonnet.** If you dispatch subagents, use Sonnet and nothing else: the enterprise quota blocks every other model (Opus, Haiku and Fable included).
- **Translations move together.** The UI has four languages, `messages/en.json`, `fr.json`, `ja.json` and `zh.json`. Every key lives in all four, in the same section. `en.json` is the typed source: [`global.d.ts`](../global.d.ts) declares next-intl's messages as `typeof import('./messages/en.json')`, so a `t('newKey')` whose key is missing from `en.json` breaks the TypeScript build, even when the other three files have it. Add the key to `en.json` first. A key missing from `fr`, `ja` or `zh` breaks nothing in the toolchain: the screen shows the raw key (`namespace.key`, see [`i18n.ts`](../i18n.ts)) and no test compares the files, so check them by hand. `fr.json` is the one the owner reads every day.
- **The name.** I.R.I.S stands for "Intelligent Recognition Inventory System". Use that expansion wherever user-facing copy spells the name out.
- **Cardmarket's API is not an option.** It is closed to new signups, so don't propose it for pricing work. Prices come from Cardmarket's public daily dumps (`npm run upload-cardmarket-dumps`), joined to a card index scraped from its gallery pages ([CARDMARKET_MAPPING.md](CARDMARKET_MAPPING.md)). A newly released set is imported with `npm run update-expansions`, which needs a BrightData token ([scrapers/cardmarket/README.md](../scrapers/cardmarket/README.md)).
- **Rules that exist twice.** Some logic lives in TypeScript for the app and again in Python for the Vinted bot: the listing title and description templates (`lib/utils/vinted-template.ts`, `lot-template.ts` and `other-item-template.ts` against the `build_*` functions in `vinted-agent/main.py`), the queue eligibility rule (`lib/vinted/queue-sync.ts`, `lot-queue-sync.ts` and `other-item-queue-sync.ts` against `should_requeue` in `vinted-agent/scheduler.py`) and the queue group key (`lib/vinted/group-key.ts` against `queue_group_key`). Change both sides, and their tests.
- **Don't reformat files.** `.prettierrc` and `npm run format` exist, but the codebase is not Prettier-clean: hundreds of files would change. Formatting a file you are editing buries your change in noise, so match the surrounding style instead.
- **Secrets and ids.** The repository is public. `.env*` (except `.env.example`), `vinted-agent/.env`, `vinted-agent/cookies*.json`, `vinted-agent/vinted_users.json` and `iris-mac-transfer/` are gitignored. They hold API keys, session tokens or account ids: keep them out of commits, logs and docs, and write placeholders such as `<owner-user-id>` in documentation.
- **Docs.** English, plain and factual, no emoji in headings. Link other files with relative links, and check that each one resolves.

## Setting up

```bash
nvm use 22 && npm install        # Node 22, see .nvmrc
cp .env.example .env.local       # fill in the keys: SETUP.md explains each one
npm run dev                      # http://localhost:3000
```

With no Supabase project and no key, `cd SHOWCASE/capture && npm install && node capture.mjs --serve` serves the app on 127.0.0.1:3100 against a throwaway local Supabase loaded with fixtures (Docker must be running; see "Refreshing the README visuals" below).

The Vinted agent is Python 3.10 or newer, in its own virtual environment:

```bash
cd vinted-agent
python -m venv .venv
.venv/bin/pip install -r requirements.txt     # .venv/Scripts/pip on Windows
```

The launchers, the cookies and the rest of the agent's setup are in [vinted-agent/README.md](../vinted-agent/README.md), its deployment as a service in [vinted-agent/DEPLOY.md](../vinted-agent/DEPLOY.md).

## Running the checks

No CI workflow runs the tests, the type check or the linter: the workflows in `.github/workflows/` are scheduled jobs (backup, Cardmarket prices, keep-warm, store events). Run everything yourself before you push.

```bash
npm test                 # Vitest, one run (npm run test:watch to watch)
npm run typecheck        # tsc --noEmit
npm run lint             # ESLint
cd vinted-agent && .venv/Scripts/python -m pytest     # the agent, on Windows
cd vinted-agent && .venv/bin/python -m pytest         # the agent, on macOS and Linux
```

- `npm run typecheck` is where a translation key missing from `messages/en.json` shows up. ESLint and Vitest don't catch it. It leaves out `scrapers/`, which has its own `tsconfig.json`; the root `npm test` does run the scraper's parser tests.
- The agent's suite takes a minute or two, because some `other_item` tests wait for the real posting delays (see TECH_DEBT.md). It needs no `.env`: `main_test.py` sets placeholder Supabase variables before it imports `main`.
- Run `npm run build` as well when a change touches routing, server components or configuration: it finds Next.js-specific problems that `tsc` and ESLint miss.

## Tests

- **Runner.** Vitest, configured in [`vitest.config.ts`](../vitest.config.ts): happy-dom, `globals` on, the `@` alias pointing at the repository root, `server-only` aliased to an empty module so server-flagged code can be imported, and the `@testing-library/jest-dom` matchers registered by `vitest.setup.ts`. It runs every `*.test.ts` and `*.test.tsx` outside `node_modules`, `.next` and `.worktrees`.
- **Next to the code.** A test sits beside the file it covers: `lib/utils/foo.ts` and `foo.test.ts`, `components/x/Y.tsx` and `Y.test.tsx`, `app/api/x/route.ts` and `route.test.ts`. Rules live in pure helpers under `lib/` and the tests target them; components get Testing Library (`render`, `screen`, `fireEvent`) when they hold behaviour worth pinning down.
- **Route tests mock Supabase.** They import the handler, call it with a `Request`, and replace `@/lib/supabase/server` (and the service client, if the route uses it) with `vi.mock`, sharing the mock functions through `vi.hoisted`. No network, no database. [`app/api/other-items/route.test.ts`](../app/api/other-items/route.test.ts) is a complete example.
- **Real battle logs.** [`lib/ptcg/fixtures/`](../lib/ptcg/fixtures/) holds six Pokémon TCG Live logs exported from real games, named `<deck>-<date>.txt`. The parser, digest, validator and stats tests read them with `readFileSync`. When the parser gets a log wrong, add that log there and write the test against it.
- **The agent.** Python tests are `vinted-agent/*_test.py`, beside the modules they cover, with Supabase replaced by `MagicMock` and `AsyncMock`.

## Database migrations

Migrations are plain SQL files in [`supabase/migrations/`](../supabase/migrations/), applied in file-name order.

- **Name.** `<YYYYMMDDHHMMSS>_<what_it_does>.sql`. `npx supabase migration new <name>` creates the file with the timestamp.
- **Apply.** `npx supabase link --project-ref <ref>` once, then `npx supabase db push`. If you ran a file in the SQL editor instead, tell the CLI with `npx supabase migration repair --status applied <timestamp>` ([SETUP.md](SETUP.md#database-migrations)).
- **Fix forward.** The CLI tracks which versions were applied, not their contents, so editing an applied file changes nothing on the hosted project. A fix for the live database is a new file. Edit an old one only so that a fresh database replays it, as was done for `20260504000000_rename_zh_to_cn.sql`.
- **Keep them re-runnable.** A migration can run more than once: a file pasted into the SQL editor can be run again later by `db push`, and every replay on a scratch database runs them all. Write them so that a second run changes nothing: `create table if not exists`, `add column if not exists`, `drop policy if exists` before `create policy`, `create or replace function`, `on conflict do nothing` for seed rows, and a guard around any data fix (a remap, a backfill) so it can't apply twice. [`20261005120000_other_items_vinted_attributes.sql`](../supabase/migrations/20261005120000_other_items_vinted_attributes.sql) shows one: it remaps the condition ids only while `vinted_size_id`, a column it adds, doesn't exist yet.
- **Row level security.** Every table in the schema has it enabled. A new table gets it, and its policies, in the same migration. The model is described in SUPABASE.md.
- **The whole chain must replay on an empty database.** `supabase db reset`, or any new project, runs every file from the first one, so a migration can't lean on state that only the hosted project has. Two traps seen so far: Postgres refuses to use a new enum value in the transaction that added it (SQLSTATE 55P04), which stopped the replay at the zh to cn rename until its updates became guarded dynamic SQL; and `20260513000000_price_history.sql` schedules a job with `pg_cron`, an extension the hosted project switched on from the dashboard.

To test a replay, build a database from the migrations in Docker:

```bash
cd SHOWCASE/capture
npm install                  # once: installs the Supabase CLI in this folder, among other things
node stack.mjs start         # Docker must be running; prints the stack's URLs and keys
node stack.mjs stop          # removes the stack and its data
```

`stack.mjs` copies the migrations into a temporary folder, adds a first migration that enables `pg_cron`, and runs `supabase start` on ports shifted by 1000, so it never collides with a local project and never touches the production one. A migration that doesn't apply makes `start` fail with Postgres's error. A stack that is already running is reused as it is, without a reset: `stop` it first to replay everything from scratch.

## The 1,000-row cap

Supabase's Data API answers at most 1,000 rows per request (the `max_rows` setting: 1000 by default, and 1000 in [`supabase/config.toml`](../supabase/config.toml)), even to an explicit `.range(0, 1999)`, and it says nothing when it truncates. That has already made Pokédex slots vanish from one page while another still showed them. Any query that can grow past 1,000 rows goes through `fetchAllRows` in [`lib/api/fetch-all.ts`](../lib/api/fetch-all.ts):

```ts
const { data, error } = await fetchAllRows((from, to) =>
  supabase
    .from('cards')
    .select('*')
    .eq('status', 'collection')
    .order('date_added', { ascending: true })
    .order('id', { ascending: true }) // a unique tiebreaker: pages must not overlap or skip
    .range(from, to),
);
```

The `.order()` must be fully deterministic, so end it on a unique column; Postgres gives no stable order otherwise. A `.in('col', ids)` filter puts the ids in the URL, so split long lists with `chunkArray` from the same file (the callers use 100 ids per request). Backups count too: [`app/api/backup/manual/route.ts`](../app/api/backup/manual/route.ts) pages every table so that a backup is never silently partial.

## Accounts and hard-coded user ids

I.R.I.S has two accounts, the owner's and a partner's, and the code treats both as known. Their Supabase auth user ids are written into the source instead of being read from configuration, so a new install has to replace them. To find every occurrence, copy the owner's id from `FRED_USER_ID` in `lib/vinted/other-item-queue-sync.ts` and the partner's from `GILLY_ID` in `app/(app)/dashboard/page.tsx`, then search the repository for each value. They appear in:

| Where | What it does with the id |
|---|---|
| `lib/vinted/other-item-queue-sync.ts` (`FRED_USER_ID`) | Names the one account allowed to use Items (`other_items`, non-TCG products sold on Vinted, invisible to the partner). Imported by the Items API routes, `app/api/vinted/post-job/route.ts`, `app/(app)/vinted/page.tsx` and `components/submit/SubmitTabs.tsx`. |
| `app/(app)/dashboard/page.tsx` and `components/logs/LogsClient.tsx` (`FRED_ID`, `GILLY_ID`) | Map the ids to first names on the sales tiles and the activity-log badges. |
| `20261002120000_other_items.sql`, `20261002120100_other_item_listings.sql`, `20261002130000_other_items_restrict_cross_partner_read.sql`, `20261002130100_other_items_status_update_queue_trigger.sql`, `20261005120200_vinted_catalog_attributes.sql` | Row level security policies and a trigger tied to the owner. Edit them before the first `db push`, or the new owner can't see Items. |
| `vinted-agent/import_scraped_other_items.py`, `vinted-agent/activate_scraped_other_items.py` | One-off scripts (`FRED_USER_ID`). |
| `20260505000000_phase4_multi_user.sql`, `20260505100000_sold_by_user.sql` | Backfills and `user_profiles` seeds for the original install. On a new project they match nothing; insert your own `user_profiles` rows instead ([SETUP.md](SETUP.md#insert-the-profiles)). |

The test files carry the ids as fixtures too. Beyond the source, three settings name the same accounts per install: the `VINTED_USER_IDS` variable (the auth user ids allowed to post to Vinted and to open `/vinted/bot`, listed in `.env.example`), the agent's `vinted_users.json` (ids mapped to cookie files, see [vinted-agent/DEPLOY.md](../vinted-agent/DEPLOY.md)), and the `user_profiles` rows. TECH_DEBT.md explains why the ids stay hard-coded and what replacing them would take.

## The PTCG coach skill

The Pokémon TCG Live coach is a Claude skill kept as plain files in `.claude/skills/ptcg-coach/` (`SKILL.md` and `references/`), next to a zip of that folder, `.claude/skills/ptcg-coach.zip`. claude.ai wants the zip, and GitHub can't download a subfolder, so both are committed, and they must agree.

- After any edit under `.claude/skills/ptcg-coach/`, run `npm run skill-zip` and commit the new zip with the change. That includes `references/profile.md`, the coach's memory, which the skill rewrites after each debrief.
- `scripts/skill-zip.test.ts` rebuilds the zip (it is deterministic: fixed timestamps, sorted entries) and compares it byte for byte with the committed one. A stale zip fails `npm test`.
- `references/typhlosion-playbook.md` is gitignored, because it condenses a paid guide and the repository is public. `skill-zip` never packs it, and the skill works without it.
- The parser and the digest behind the skill are in `lib/ptcg/`, with `npm run ptcg-digest` and `npm run ptcg-bundle` as their command-line entries. The claude.ai Project setup is in [docs/ptcg-coach-project/](ptcg-coach-project/).

## Refreshing the README visuals

Every image and GIF of the README is recorded by a script, never captured by hand: [`SHOWCASE/capture/`](../SHOWCASE/capture/). It starts a throwaway Supabase in Docker from the project's own migrations, loads sanitized fixtures (fake Vinted ids, renamed opponents), serves the app against it with every external key blanked, signs in with the fixture account and records each shot into `SHOWCASE/media/`. The scanner's OCR call is answered from `fixtures/scan.json`, so no Gemini key is needed. Nothing touches the production project. The fixtures are a sanitized snapshot taken once (test accounts, fake Vinted ids, renamed opponents, no notes), and the only photos in them are a few dozen of the cards', lots' and items' own photos, resized; keep it that way when you add fixtures.

```bash
cd SHOWCASE/capture
npm install                         # once: Playwright, the Supabase CLI and pg, in this folder only
npx playwright install chromium     # once: the browser
node capture.mjs                    # every shot (Docker must be running)
node capture.mjs dashboard vinted   # only these shots
node capture.mjs --serve            # no shots: the seeded app on 127.0.0.1:3100, to click around in
```

The GIFs also need ffmpeg and Python 3. The header of [`capture.mjs`](../SHOWCASE/capture/capture.mjs) lists every flag (`--keep` and `--reuse` keep the stack and the app running while you iterate on a shot). To add or change a shot, edit the `SHOTS` table in that file.
