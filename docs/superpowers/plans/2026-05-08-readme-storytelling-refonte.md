# README storytelling refonte — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite [`README.md`](../../../README.md) as a single storytelling document that addresses the reader directly, distributes screenshots contextually, removes the isolated metrics section, and preserves portfolio-grade technical depth.

**Architecture:** Single-file content rewrite. The full final prose is embedded in this plan so execution is essentially a `Write` call followed by verification. There is no code change, no test suite, no compilation. The plan is structured as: pre-flight verification → write file → post-write verification → user review checkpoint → commit.

**Tech Stack:** Markdown only. The README references existing screenshot paths declared in [`docs/SCREENSHOTS_TODO.md`](../../../docs/SCREENSHOTS_TODO.md), existing doc files in [`docs/`](../../../docs/), and the existing badge URLs.

**Spec:** [`docs/superpowers/specs/2026-05-08-readme-storytelling-design.md`](../specs/2026-05-08-readme-storytelling-design.md)

---

## File Structure

**Modified:**
- `README.md` — full rewrite, replaces existing 189 lines

**Read-only references (no edits):**
- `docs/SCREENSHOTS_TODO.md` — confirms expected screenshot filenames
- `docs/SETUP.md`, `docs/FEATURES.md`, `docs/COMMANDS.md`, `docs/SUPABASE.md`, `docs/CHANGELOG.md`, `ARCHITECTURE.md` — confirms doc links resolve
- `public/logo.png` — confirms hero logo path

No new files are created. No tests are added (this is a doc rewrite — no executable code).

---

## Task 1: Pre-flight verification

**Files:**
- Read: `docs/SCREENSHOTS_TODO.md`
- Read: `docs/` listing
- Read: `public/logo.png` (existence check only)

- [ ] **Step 1: Confirm all screenshot filenames referenced in the new README exist as expected names in SCREENSHOTS_TODO.md**

Run:
```bash
grep -oE 'docs/screenshots/[a-z-]+\.png' docs/SCREENSHOTS_TODO.md | sort -u
```

Expected output must include exactly these eight filenames (the new README references all of them):
```
docs/screenshots/annonce-modal.png
docs/screenshots/bulk-vendu.png
docs/screenshots/dashboard.png
docs/screenshots/lot-form.png
docs/screenshots/pokedex-grid.png
docs/screenshots/scanner.png
docs/screenshots/stock-list.png
docs/screenshots/vinted-list.png
```

If any filename is missing from `SCREENSHOTS_TODO.md`, STOP and reconcile (either rename in the README to match the TODO, or add the new filename to the TODO checklist).

- [ ] **Step 2: Confirm all doc links in the new README resolve**

Run:
```bash
ls docs/SETUP.md docs/FEATURES.md docs/COMMANDS.md docs/SUPABASE.md docs/CHANGELOG.md ARCHITECTURE.md public/logo.png lib/utils
```

Expected: every path resolves (no "No such file or directory" errors).

- [ ] **Step 3: Note current README size for diff sanity**

Run:
```bash
wc -l README.md
```

Expected: ~189 lines. The new file will be roughly ~190–210 lines (similar overall density, different shape). Record this as the baseline so the post-write check can flag any wildly off result.

---

## Task 2: Write the new README

**Files:**
- Modify (full overwrite): `README.md`

- [ ] **Step 1: Read current README to satisfy the Write tool's read-before-write rule**

Read `README.md` in full. (No edits yet — this is a tool prerequisite.)

- [ ] **Step 2: Overwrite `README.md` with the full storytelling version below**

Write the **exact** content below to `README.md`. Do not paraphrase, do not "improve" inline, do not add or drop sections. The prose has been validated in the spec and tightened for tone — copy verbatim.

````markdown
<div align="center">

<img src="public/logo.png" alt="I.R.I.S logo" width="140" />

# I.R.I.S

### Intelligent Recognition Inventory System

A two-collector PWA that scans, prices, and sells a shared Pokémon TCG collection — from camera to Vinted in three taps.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Tests](https://img.shields.io/badge/tests-344%20passing-success)](#-testing)
[![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8)](#)

[The scan](#-it-starts-with-a-scan) · [The views](#-now-where-does-it-go) · [The sell](#-time-to-sell) · [The two of us](#-but-youre-not-alone) · [The control room](#-the-control-room) · [Under the hood](#-under-the-hood) · [Quick start](#-try-it-yourself) · [Docs](#-going-deeper)

</div>

---

## Two collectors, one shoebox of cards

A shared collection. Two Vinted accounts. Cards moving in and out, prices shifting daily, and the same nagging question every evening: *whose card is this, has it been listed, has it sold, at what price?*

That's why I built **I.R.I.S** — *Intelligent Recognition Inventory System*. Solo, over ~3 months. Used every day.

---

## 📷 It starts with a scan

You point your phone at a card. Three seconds later, I.R.I.S knows the name in two languages, the set, the rarity, the illustrator, and what it's worth on Cardmarket today.

The OCR runs on **Gemini 3.1 Flash Lite Preview** (~93 % accuracy, structured JSON in a single call) with **Google Vision** as automatic fallback. ~€0.0004 per scan. Five languages supported — Japanese, English, French, Korean, Chinese — with bilingual name extraction for FR cards (`"Gruikui (チャオブー)"`).

Once the card is identified, a 6-strategy enrichment pipeline fills in the rest from a **52K-card local catalog** scraped from LimitlessTCG and queried offline-first, with TCGdex as a live fallback for new sets.

![Scanner](docs/screenshots/scanner.png)

---

## 🗂 Now, where does it go?

Every card lands in one of three places.

**Pokédex** — exactly one card per Pokémon, all 1 025 species. Three display modes (large grid, compact grid, list), search by number or name, and a swap-on-replace flow when promoting a card from Stock or Vinted.

**Stock** — the physical inventory mirror. Count chips for duplicate copies, instant clone button when you pull a second copy out of the binder.

**Vinted** — the for-sale pile. State chips (offline / online / stale / sold), bulk-sold flow with per-card price split, restock proposals, partner cleanup notices.

| Pokédex | Stock | Vinted |
|---|---|---|
| ![Pokédex](docs/screenshots/pokedex-grid.png) | ![Stock](docs/screenshots/stock-list.png) | ![Vinted](docs/screenshots/vinted-list.png) |

And when a single Vinted listing should bundle several cards, **Lots** ship a custom photo set + template description as one annonce.

![Lot](docs/screenshots/lot-form.png)

---

## 💰 Time to sell

You don't price your cards. I.R.I.S does.

Cardmarket's official API closed to new applicants in 2023, so the pricing pipeline is bespoke: a daily mirror of their public S3 dumps (**67 K products + 72 K pricing rows**) into Postgres, plus a per-expansion **Playwright** gallery scrape that builds an exact `(expansion, set_number) → idProduct` index. No fuzzy name guessing — every priced card carries a "View on Cardmarket ↗" deep link so the match is verifiable.

The annonce generator turns a saved card into a ready-to-paste Vinted post: bilingual title (smart-truncated to 80 chars), templated description with shipping block, copy-to-clipboard button, downloadable card image (PNG, anti-bot watermark stripped). When a customer buys several cards at once, the bulk-sold flow splits the total across them automatically.

| Annonce | Bulk vendu |
|---|---|
| ![Annonce](docs/screenshots/annonce-modal.png) | ![Bulk vendu](docs/screenshots/bulk-vendu.png) |

---

## 👥 But you're not alone

Your partner has her own Vinted account. The collection is shared. The listings are not.

Under the hood, `cards` and `lots` are shared rows that both users read. `card_listings` and `lot_listings` are per-user rows protected by **Postgres Row-Level Security scoped to `auth.uid()`** — only the owner can write their own listing state. Each user gets a distinct identity color across the UI (badges, action labels), so it's always obvious who's selling what.

When you mark a partner's listing as sold, I.R.I.S runs a cleanup pass: the listing is taken down, an optional restock proposal chains correctly across both accounts, and a partner-cleanup notice fires if the same card was also up on the other side.

---

## 📊 The control room

At the end of the day, you want the whole picture.

The Dashboard answers in one screen: **4 KPI tiles** (stock value, OCR cost over 30 days, scan count, restock alerts), **4 charts** (cost stacked bar, stock-value area, rarity drill-down donut, and a custom-SVG 52-week scan heatmap; the rest is Recharts), and a top-10 rares table that deep-links into the card drawer.

Behind the scenes, a **daily Vercel cron** refreshes Cardmarket pricing nightly. A **daily GitHub Actions cron** snapshots the database to gzipped releases — rotation 30 daily / 12 weekly / 12 monthly. One-click manual backups from the Options page push gzipped dumps to a Supabase bucket with signed-URL download.

And the whole thing installs as a PWA — manifest plus maskable icons, auto-show install banner on Chrome/Edge/Android, illustrated 3-step modal for iOS Safari.

![Dashboard](docs/screenshots/dashboard.png)

---

## 🛠 Under the hood

Here's what's holding it all together.

| Layer | Choice | Why |
|---|---|---|
| **Framework** | Next.js 16 (App Router) | Server components for data-loading pages, edge runtime where it matters, file-system routing. |
| **Language** | TypeScript (strict) | End-to-end type safety, including the database via Supabase generated types. |
| **UI** | React 19 + Tailwind v4 | Tailwind v4 uses `@theme` in CSS (no JS config). Lucide icons. |
| **Database** | Supabase (Postgres + Storage + Auth + RLS) | Managed Postgres with first-class RLS, S3-compatible Storage for card photos, magic-link/password auth out of the box. |
| **OCR** | Gemini 3.1 Flash Lite Preview (primary), Google Vision (fallback) | Gemini extracts structured JSON in one call (vs Vision's raw text + regex). 93 % accuracy bench-validated. |
| **Catalog source** | LimitlessTCG (scraper) | Cardmarket API closed to new applicants in 2023; LimitlessTCG's robots.txt allows scraping with delays. |
| **Pricing source** | Cardmarket S3 dumps + per-expansion gallery scrape | Public dumps refreshed daily; per-expansion scrape builds a `(set, number) → idProduct` index for exact matching. |
| **Hosting** | Vercel (app + cron) + Supabase (DB + storage) | Both have generous free tiers; Vercel's preview deployments and edge cron are first-class. |
| **Testing** | Vitest + happy-dom | Fast pure-function tests for the helpers; React Testing Library for components. |

A few architectural choices worth calling out:

- **Server components for pages, client components for interactivity.** Pages do parallel Supabase queries server-side; rows and modals are client components that hit API routes for mutations.
- **Per-user RLS, shared inventory.** `cards` / `lots` are readable by both users; `card_listings` / `lot_listings` are writable only by their owner. The "who listed it" identity is computed at render time.
- **Helpers are pure.** All logic that doesn't need React or Supabase lives in [`lib/utils/`](lib/utils/) — ~24 modules, all unit-tested. Components consume helpers; no business logic in JSX.
- **Catalog-first enrichment.** Local Postgres lookup beats live API every time; TCGdex is the network fallback only when the local catalog has no hit.
- **Cardmarket pricing without the API.** Public S3 dumps + Playwright gallery scrape build a `(set, number) → idProduct` index. Exact matches, no name fuzzing.

Full code map in **[ARCHITECTURE.md](ARCHITECTURE.md)**.

---

## 🚀 Try it yourself

```bash
git clone https://github.com/<you>/iris.git && cd iris
nvm use 22 && npm install
cp .env.example .env.local                          # fill in keys — see docs/SETUP.md
npx supabase link --project-ref <ref> && npx supabase db push
npx tsx scripts/scrape-limitlesstcg.ts              # ~12 min, populates the offline catalog
npm run dev                                         # → http://localhost:3000
```

The full setup walkthrough — Supabase provisioning, Google Vision and Gemini keys, Vercel cron, WSL2 SSL gotchas — lives in **[docs/SETUP.md](docs/SETUP.md)**.

---

## 📚 Going deeper

| Doc | What you'll find |
|---|---|
| **[docs/SETUP.md](docs/SETUP.md)** | Every key, every command, every WSL2 gotcha. Start here if you want to run it. |
| **[docs/FEATURES.md](docs/FEATURES.md)** | The full feature catalog with edge cases. The "what does it actually do?" reference. |
| **[docs/COMMANDS.md](docs/COMMANDS.md)** | Every npm script and `tsx` script in the repo, with usage and intent. |
| **[docs/SUPABASE.md](docs/SUPABASE.md)** | Database schema, migrations, RLS policies, storage buckets, reset-from-scratch procedure. |
| **[docs/CHANGELOG.md](docs/CHANGELOG.md)** | Phase-by-phase build history with what shipped and why. |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | The code map — directory structure, key abstractions, data flow. |

---

## 🧪 Testing

```bash
npm test              # run once
npm run test:watch    # watch mode
npm run typecheck     # tsc --noEmit
npm run lint          # ESLint
npm run format        # Prettier --write
```

UI components are thin wrappers around ~24 pure helper modules in [`lib/utils/`](lib/utils/) — that's where the logic and the tests live. **344 tests, zero lint warnings, zero type errors.**

---

## 🗺 What's next

- Backup of card photos to a separate Storage bucket (currently inline in the cards table).
- UI for restoring from a manual backup snapshot.
- Standardize the API error response shape across all routes.
- Per-card metadata scrape from Cardmarket detail pages (rarity ground-truth, currently inferred heuristically).

---

## 📄 License

This is a personal project. Source code is provided as-is for portfolio and learning purposes. No license is granted for commercial use or redistribution.

---

<div align="center">

Built with curiosity, far too much coffee, and a lot of Pokémon cards.

</div>
````

> **Note for the implementer:** the content block above is **fenced inside this plan** with a four-backtick fence so the inner triple-backtick code blocks render. When writing to `README.md`, strip the outer four-backtick fence — write only what is between them.

---

## Task 3: Post-write verification

**Files:**
- Read: `README.md` (newly written)

- [ ] **Step 1: Verify the file size is in the expected range**

Run:
```bash
wc -l README.md
```

Expected: 180–230 lines. The baseline was ~189; the new version is in the same ballpark.

- [ ] **Step 2: Verify every screenshot reference in the README appears in SCREENSHOTS_TODO.md**

Run:
```bash
for f in $(grep -oE 'docs/screenshots/[a-z-]+\.png' README.md | sort -u); do
  grep -q "$(basename "$f")" docs/SCREENSHOTS_TODO.md && echo "OK $f" || echo "MISSING $f"
done
```

Expected: every line starts with `OK `. The README references a strict subset of the TODO checklist; missing entries mean either the README references a non-planned filename or the TODO file is out of date.

- [ ] **Step 3: Verify every doc link target exists**

Run:
```bash
for f in docs/SETUP.md docs/FEATURES.md docs/COMMANDS.md docs/SUPABASE.md docs/CHANGELOG.md ARCHITECTURE.md public/logo.png; do
  test -e "$f" && echo "OK $f" || echo "MISSING $f"
done
```

Expected: every line starts with `OK `.

- [ ] **Step 4: Verify the old "Project metrics" and gallery "Screenshots" sections are gone**

Run:
```bash
grep -nE '^## (Project metrics|📊 Project metrics|📷 Screenshots)$' README.md || echo "OK - no leftover sections"
```

Expected: `OK - no leftover sections`.

- [ ] **Step 5: Verify the storytelling section count**

Run:
```bash
grep -cE '^## ' README.md
```

Expected: `12` — exactly twelve `##` section headers. They are, in order:
1. `## Two collectors, one shoebox of cards`
2. `## 📷 It starts with a scan`
3. `## 🗂 Now, where does it go?`
4. `## 💰 Time to sell`
5. `## 👥 But you're not alone`
6. `## 📊 The control room`
7. `## 🛠 Under the hood`
8. `## 🚀 Try it yourself`
9. `## 📚 Going deeper`
10. `## 🧪 Testing`
11. `## 🗺 What's next`
12. `## 📄 License`

If the count is off, list the headers (`grep -nE '^## ' README.md`) and reconcile.

- [ ] **Step 6: Mental render walkthrough**

Read the file top to bottom. Verify, in order:
1. Hero block is centered, logo + title + acronym + tagline + 7 badges + nav line.
2. Opening hook *"Two collectors, one shoebox of cards"* opens on the chaos, lands on the I.R.I.S name + the daily-use note.
3. Each of the 5 storytelling sections (capture, views, sell, collab, control room) opens on a `you`-addressed action line, then drops the technical substance, then shows its visual proof.
4. The "But you're not alone" section has **no screenshot** (intentional — it's the only one).
5. The "Going deeper" doc table reads like one-line storytelling pitches, not dry "Purpose" labels.
6. The footer is the existing closing line *"Built with curiosity, far too much coffee, and a lot of Pokémon cards."*

Note any drift from the spec; fix inline before moving on.

---

## Task 4: User review checkpoint

**Files:** none modified.

- [ ] **Step 1: Tell the user the rewrite is done and ask for review**

Message the user with:
- The new file is written but **not committed yet**.
- Ask them to read `README.md` and flag anything they want to adjust — tone of a hook, a section's substance, screenshot placement, copy of the tagline, anything.
- Mention explicitly that broken screenshot images will render as alt text (`![Scanner](...)` shows as broken-image icon) until captures land — this is expected and intentional, the README is forward-compatible with the [`docs/SCREENSHOTS_TODO.md`](../../../docs/SCREENSHOTS_TODO.md) capture list.

- [ ] **Step 2: Wait for explicit user approval before proceeding to commit**

If they request changes:
- Make them via `Edit` (no full rewrite — surgical edits to keep the rest of the doc stable).
- Re-run Task 3 verification steps that touch the changed area.
- Re-loop Task 4.

If they approve, proceed to Task 5.

---

## Task 5: Commit

**Files:**
- Stage: `README.md`

- [ ] **Step 1: Stage only the README**

Run:
```bash
git add README.md
```

Note: the user's working tree has **many other unrelated `M` files** in progress (api-response refactor across `app/api/**` and a new `lib/utils/api-response.ts` + test). Do **not** stage these — they belong to a separate workstream and the user has not asked to include them in this commit.

Confirm staging is clean:
```bash
git diff --cached --name-only
```

Expected output: exactly `README.md` and nothing else.

- [ ] **Step 2: Commit**

Run:
```bash
git commit -m "$(cat <<'EOF'
docs(readme): full storytelling refonte

Rewrite README.md to address the reader directly across five
narrative sections (scan / views / sell / collab / control room),
distribute screenshots contextually inside each section, drop the
isolated "Project metrics" and "Screenshots" gallery, and keep
portfolio-grade technical depth (named techs, real numbers, RLS
model, Cardmarket pipeline rationale) inside the prose.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Verify commit landed cleanly**

Run:
```bash
git log -1 --stat
```

Expected:
- Commit message matches the one above.
- One file changed: `README.md`.
- Diff stats are non-trivial (full rewrite, ~190 lines deleted, ~210 lines added — exact numbers will vary).

- [ ] **Step 4: Confirm the working tree still has the user's other in-progress work**

Run:
```bash
git status --short
```

Expected: the long list of `M` and `??` files from the api-response workstream is still present and untouched. The only thing the commit absorbed was `README.md`.

---

## Out of scope (do not do in this plan)

- Capturing screenshots. The `docs/screenshots/` directory is empty; the new README references future filenames declared in `docs/SCREENSHOTS_TODO.md`. Captures land in a separate workstream.
- Rewriting `docs/*.md` in the same storytelling style. The user has flagged this as a follow-up.
- Touching the user's in-progress api-response refactor (the many `M` files in `app/api/**`).
- Adding a CHANGELOG entry for the README rewrite (the project's `docs/CHANGELOG.md` tracks **product phases**, not doc updates — this would be off-pattern).
