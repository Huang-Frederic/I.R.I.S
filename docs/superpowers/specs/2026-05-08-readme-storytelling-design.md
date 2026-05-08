---
name: README storytelling refonte
description: Design for a full rewrite of README.md in storytelling style while preserving portfolio-grade technical substance. Screenshots distributed contextually, no isolated metrics section.
type: spec
date: 2026-05-08
---

# README storytelling refonte — design

## Goal

Rewrite [`README.md`](../../../README.md) so that:

1. It **reads as a story** that addresses the reader directly ("you"), with each section opening on a concrete hook before any jargon.
2. It **keeps full portfolio-grade technical depth** — architecture choices, numbers, trade-offs, naming of real techs are inlined as proof inside the story, not stripped out.
3. **Screenshots are distributed contextually**, embedded right after the section that describes them. No isolated screenshot gallery.
4. The **"Project metrics" section is removed** — its numbers are dissolved into relevant sections as natural proof points.
5. Details remain in [`docs/`](../../../docs/) — README points there, doesn't duplicate.
6. Language: **English** (matches current README, portfolio-friendly).
7. Visual style: **sober & efficient** — no heavy HTML, simple centered hero, light emoji accents, GitHub-renderable on mobile.

## Non-goals

- No rewrite of `docs/*.md` in this spec (the user has signaled it as a follow-up; out of scope here).
- No new screenshots captured — `docs/screenshots/` is empty today, but file paths in the README assume the names from [`docs/SCREENSHOTS_TODO.md`](../../../docs/SCREENSHOTS_TODO.md) so the captures-to-come slot in seamlessly.
- No change to badges set, license, or project structure.

## Tone & narrative guardrails

- **Direct address**: "you", "your", never "the user".
- **Action-first openers**: each section starts with a short, concrete sentence that shows a *moment* or *action*, not a definition.
- **Jargon arrives in sentence 2+**, never in the hook. "Gemini 3.1 Flash Lite Preview" lives in the proof, not the lede.
- **Numbers as proof, not vitrine**: "52K cards, scraped once, queried offline" inside the prose, never inside an isolated metrics table.
- **One section = one idea + one visual proof** (when one fits naturally). Sections without a natural screenshot stay text-only.
- **Conversational but tight**: a section is 3–6 short paragraphs max. No walls of text. No multi-clause sentences when two short ones do the job.
- **Portfolio rigor preserved**: every section names the real techs (Postgres RLS, Supabase Storage, Recharts, Playwright, Vercel cron, etc.), real numbers, and the *why* behind each choice. The story is the wrapper, not a substitute for substance.

## Final section ordering

1. Hero
2. Opening hook — *Two collectors, one shoebox of cards*
3. *It starts with a scan* — Capture & enrich
4. *Now, where does it go?* — Three views, one shared inventory
5. *Time to sell* — Pricing & annonce
6. *But you're not alone* — Two collectors, one app
7. *The control room* — Dashboard & operations
8. *Under the hood* — Tech stack + architecture highlights
9. *Try it yourself* — Quick start
10. *Going deeper* — Documentation index
11. Testing
12. Roadmap
13. License + footer

## Section-by-section breakdown

### 1. Hero (centered)

- Logo (`public/logo.png`, 140px).
- Title `# I.R.I.S`.
- Subtitle: *Intelligent Recognition Inventory System*.
- One-line tagline (replaces current bold paragraph): something like *"A two-collector PWA that scans, prices, and sells a shared Pokémon TCG collection — from camera to Vinted in three taps."*
- Badges: Next.js 16 · React 19 · TypeScript strict · Tailwind v4 · Supabase · Tests (count) · PWA. **Same set as today.**
- Nav links: jump anchors to the main story sections — *The scan* · *The views* · *The sell* · *The two of us* · *The control room* · *Under the hood* · *Quick start* · *Docs*.

### 2. Opening hook — *Two collectors, one shoebox of cards*

3–4 short lines that set the scene: a shared collection, two Vinted accounts, the operational chaos of "whose card is this, has it been listed, has it sold, at what price". Then the reveal: *"That's why I built I.R.I.S."* Close with the daily-use note ("Built solo over ~3 months. Used every day.") so the reader knows it's a real product, not a portfolio toy.

**No screenshot here.** The hero owns the visual real estate at the top.

### 3. *It starts with a scan* — Capture & enrich

**Opener (draft)**: *"You point your phone at a card. Three seconds later, I.R.I.S knows the name in two languages, the set, the rarity, the illustrator, and what it's worth on Cardmarket today."*

**Substance to cover**:
- Multi-engine OCR: **Gemini 3.1 Flash Lite Preview** as primary (~93 % accuracy, structured JSON in one call), **Google Vision** as automatic fallback. Cost ~€0.0004 per scan.
- 5 supported languages: JP / EN / FR / KO / ZH. Bilingual name extraction for FR cards (`"Gruikui (チャオブー)"`).
- Local catalog of **52K cards** scraped from LimitlessTCG, queried offline-first; TCGdex as live fallback for new sets.
- 6-strategy enrichment pipeline (one-line summary; the gory details live in `docs/FEATURES.md` / `ARCHITECTURE.md`).

**Visual**: `docs/screenshots/scanner.png` inline, full width, right after the prose.

### 4. *Now, where does it go?* — Three views

**Opener (draft)**: *"Every card lands in one of three places."*

**Substance**:
- **Pokédex** — exactly 1 card per Pokémon, all 1 025 species, 3 display modes, swap-on-replace flow.
- **Stock** — physical inventory mirror, count chips for duplicates, instant clone.
- **Vinted** — for-sale pile with state chips (offline / online / stale / sold), bulk-sold flow with per-card price split, restock proposals.
- **Lots** — bundle multiple cards as a single Vinted listing with custom photos and template.

**Visual**: 3-column table for the three views (`pokedex-grid.png` | `stock-list.png` | `vinted-list.png`), then a single full-width row for `lot-form.png`.

### 5. *Time to sell* — Price & annonce

**Opener (draft)**: *"You don't price your cards. I.R.I.S does."*

**Substance**:
- Cardmarket's **official API closed to new applicants in 2023**, so we built our own pipeline: daily mirror of their public S3 dumps (**67 K products + 72 K pricing rows**) into Postgres, plus a per-expansion **Playwright** gallery scrape that gives us an exact `(expansion, set_number) → idProduct` index. **No fuzzy name matching.**
- Every priced card carries a "View on Cardmarket ↗" deep link — verifiable matching.
- Smart annonce generator: bilingual title (smart-truncated to 80 chars), templated description with shipping block, copy-to-clipboard, downloadable card image (PNG, anti-bot watermark stripped).
- Bulk-sold flow with per-card price split when a customer buys several at once.

**Visual**: 2-column table (`annonce-modal.png` | `bulk-vendu.png`).

### 6. *But you're not alone* — Two collectors, one app

**Opener (draft)**: *"Your partner has her own Vinted account. The collection is shared. The listings are not."*

**Substance**:
- Two-user architecture: `cards` and `lots` are shared rows; `card_listings` and `lot_listings` are per-user rows with **Postgres Row-Level Security scoped by `auth.uid()`**.
- Identity colors: each user gets a distinct color across the UI (badges, action labels) so it's always obvious who listed what.
- Cross-user sold flow: marking a partner's listing as sold triggers a cleanup notice and an optional restock proposal that chains correctly across both accounts.

**No dedicated screenshot.** The collab signal already shows up in `vinted-list.png` (two-color badges) earlier in the README.

### 7. *The control room* — Dashboard & operations

**Opener (draft)**: *"At the end of the day, you want the whole picture."*

**Substance**:
- Dashboard: **4 KPI tiles** (stock value, OCR cost 30 d, scan count, restock alerts), **4 charts** (cost stacked bar, stock-value area, rarity drill-down donut, 52-week scan heatmap — custom SVG, the rest Recharts), top-10 rares table.
- **Daily Vercel cron** refreshes Cardmarket pricing nightly.
- **Daily GitHub Actions cron** snapshots the database to gzipped releases — rotation 30 daily / 12 weekly / 12 monthly.
- One-click **manual backups** from the Options page → Supabase bucket → signed-URL download.
- **Installable PWA**: manifest + maskable icons, auto-show install banner on Chrome/Edge/Android, illustrated 3-step modal for iOS Safari.

**Visual**: `dashboard.png` full width.

### 8. *Under the hood* — Tech stack + architecture highlights

**Transition line**: *"Here's what's holding it all together."*

- **Tech stack table** — keep the current Layer / Choice / Why structure. Tighten copy where possible (single sentence per row).
- **Architecture highlights** — keep the current 5 bullets:
  - Server components for pages, client for interactivity.
  - Per-user RLS, shared inventory.
  - Helpers are pure (~24 helper modules, all unit-tested).
  - Catalog-first enrichment.
  - Cardmarket pricing without the API.
- Closing line: *"Full code map in [ARCHITECTURE.md](ARCHITECTURE.md)."*

### 9. *Try it yourself* — Quick start

Six commands max, in a single fenced block:

```bash
git clone <repo> && cd iris
nvm use 22 && npm install
cp .env.example .env.local            # fill in keys — see docs/SETUP.md
npx supabase link --project-ref <ref> && npx supabase db push
npx tsx scripts/scrape-limitlesstcg.ts   # ~12 min, populates the offline catalog
npm run dev
```

Followed by **one line**: *"The full setup walkthrough — Supabase provisioning, Google Vision and Gemini keys, Vercel cron, WSL2 SSL gotchas — lives in [docs/SETUP.md](docs/SETUP.md)."*

### 10. *Going deeper* — Documentation index

Table identical in shape to the current one, but with **one storytelling line per doc** instead of dry "Purpose" labels. Example:

| Doc | What you'll find |
|---|---|
| [docs/SETUP.md](docs/SETUP.md) | Every key, every command, every WSL2 gotcha. Start here if you want to run it. |
| [docs/FEATURES.md](docs/FEATURES.md) | The full feature catalog with edge cases. The "what does it actually do?" reference. |
| ... | ... |

### 11. Testing

Compact: the four commands (`npm test`, `test:watch`, `typecheck`, `lint`) followed by **one sentence** on the philosophy: *"UI components are thin wrappers around ~24 pure helper modules in [`lib/utils/`](lib/utils/) — that's where the logic and the tests live."*

Drop the long enumeration of helper names from the current README.

### 12. Roadmap

Keep current 4 bullets verbatim. Title becomes *"What's next."* — no "Roadmap" header.

### 13. License + footer

Identical to current README. The closing line *"Built with curiosity, far too much coffee, and a lot of Pokémon cards."* stays — it's already on-tone.

## Screenshot placement summary

| Section | Screenshot(s) | Layout |
|---|---|---|
| 3 — *It starts with a scan* | `scanner.png` | Inline, full width |
| 4 — *Now, where does it go?* | `pokedex-grid.png`, `stock-list.png`, `vinted-list.png` | 3-col table |
| 4 — (Lots subsection) | `lot-form.png` | Full-width row beneath the 3-col table |
| 5 — *Time to sell* | `annonce-modal.png`, `bulk-vendu.png` | 2-col table |
| 7 — *The control room* | `dashboard.png` | Full width |

All file paths match the names already declared in [`docs/SCREENSHOTS_TODO.md`](../../../docs/SCREENSHOTS_TODO.md). The captures-to-come slot in without README edits later.

## What gets removed from the current README

- The standalone **Project metrics** table (lines 118–131 of current README).
- The **Screenshots** section as a separate gallery (lines 133–143).
- The **long enumeration of helper module names** in the Testing section.
- The "Visual capture in progress" note — replaced by silent fallback (broken images render as alt text until captures land).

## Implementation steps (handed to writing-plans)

1. Read the current README in full.
2. Draft the new README in a single pass following this spec.
3. Replace `README.md` content (overwrite, don't append).
4. Verify all screenshot paths still match `docs/SCREENSHOTS_TODO.md`.
5. Verify all doc links still resolve (`docs/SETUP.md`, `docs/FEATURES.md`, etc.).
6. Verify badge URLs are intact.
7. Visual sanity check: render the markdown mentally — does the hero land? Does each section open on its hook? Are screenshots inline?
8. Commit only when the user has reviewed.

## Out of scope for this spec

- Capturing the screenshots themselves.
- Rewriting `docs/*.md` in the same storytelling style (tracked as a follow-up the user has flagged).
- Any code change outside `README.md`.
