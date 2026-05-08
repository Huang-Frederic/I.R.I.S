# Architecture

Here's how I.R.I.S is built. Read it if you want to understand where things live and why. For user-facing functionality, see [FEATURES.md](FEATURES.md). For the database layer, see [SUPABASE.md](SUPABASE.md).

## Table of contents

- [Guiding principles](#guiding-principles)
- [Directory layout](#directory-layout)
- [App Router conventions](#app-router-conventions)
- [Data flow: scan pipeline](#data-flow-scan-pipeline)
- [Data flow: pricing pipeline](#data-flow-pricing-pipeline)
- [Data flow: listings (multi-user)](#data-flow-listings-multi-user)
- [Key modules](#key-modules)
- [Testing strategy](#testing-strategy)

---

## 🧱 Guiding principles

### 1. Pure helpers, thin components

All business logic — grouping, filtering, sorting, formatting, validation — lives in `lib/utils/` as **pure functions** that take typed inputs and return typed outputs. Components consume helpers; they don't compute. This makes the logic unit-testable in isolation (no React, no Supabase) and the components a thin transformation of state.

### 2. Server components for reads, client components for interactivity

Pages (server components) fan out parallel Supabase queries server-side. Lists, rows, and modals (client components) call API routes for mutations. The pattern avoids the latency of client-side waterfalls and keeps the security boundary clear.

### 3. Catalog-first, network last

The local Postgres catalog (`tcg_catalog`, 52K cards) is queried before any external API. TCGdex is the network fallback only when the local catalog has no hit. Same for pricing: Cardmarket S3 dumps live in Postgres, TCGdex is the live fallback.

### 4. Per-user RLS, shared inventory

Cards and lots are shared between the two users — both can read. The "listed by" state is per-user (`card_listings` / `lot_listings`) with RLS scoped by `auth.uid()`.

### 5. No business logic in JSX

If you'd want to write a comment in a component to explain *why* something is computed, the computation belongs in a helper. The component only needs to know what to render.

---

## 🗂 Directory layout

The codebase is organized around Next.js App Router conventions.

```
.
├── app/                         Next.js App Router pages + API routes
│   ├── (app)/                   Authenticated app group (uses (app)/layout.tsx)
│   │   ├── dashboard/
│   │   ├── pokedex/
│   │   ├── stock/
│   │   ├── submit/              Scanner / Lot / Batch tabs
│   │   ├── vinted/
│   │   ├── options/
│   │   └── layout.tsx           User context, sidebar, install prompt
│   ├── (auth)/                  Login flow
│   ├── api/                     Route handlers (server-only)
│   │   ├── cards/               POST/PATCH/DELETE/clone/batch
│   │   ├── lots/
│   │   ├── listings/            Per-user listing state
│   │   ├── ocr/                 Gemini → Vision pipeline
│   │   ├── enrich/              6-strategy enrichment
│   │   ├── pokedex/             Suggest, replace
│   │   ├── prices/update/       Cron + single-card refresh
│   │   └── backup/manual/       Manual database dump
│   ├── globals.css              Tailwind v4 theme via @theme
│   ├── layout.tsx               Root: html/body, font, theme cookie
│   ├── manifest.ts              PWA manifest
│   ├── icon.png + apple-icon.png
│
├── components/
│   ├── cards/                   Shared card widgets (Move-to-Pokédex modal, replace modal)
│   ├── dashboard/               KPI tiles + Recharts
│   ├── layout/                  Sidebar, BottomNav, InstallPrompt, RouteChangeRefresher
│   ├── lots/                    Lot form + row + annonce modal
│   ├── options/                 Theme toggle, sign out, manual backups, PWA install section
│   ├── pokedex/                 Grid + cell + drawer + scan-from-drawer modal
│   ├── stock/                   List + row + filters + count chip
│   ├── submit/                  Scanner form + Lot form + Batch form (all under (app)/submit/SubmitTabs)
│   ├── ui/                      Reusable widgets (CardmarketLink, PriceFreshnessBadge, RefreshPriceButton)
│   └── vinted/                  Big one: VintedList, VintedRow, VintedFilters, AnnonceModal,
│                                SoldModal, BulkSelectionBottomBar, ListingBadges, etc.
│
├── lib/
│   ├── api/                     External-source clients (TCGdex, Gemini, Vision, LimitlessTCG, Cardmarket)
│   ├── constants/               Pricing coefficient, etc.
│   ├── data/                    Static data (Pokémon names FR/EN)
│   ├── hooks/                   useUserContext, …
│   ├── supabase/                Browser + server + service clients
│   ├── types/                   Shared TS types (Card, Lot, EnrichedCard, etc.)
│   └── utils/                   Pure helpers (24+ files, all unit-tested)
│
├── scripts/                     One-off + cron scripts (see docs/COMMANDS.md)
│   ├── data/                    Seeds for the scripts (cardmarket-modern-expansions.json)
│   ├── seed/                    Local dev seed (writes to cards table)
│   ├── backup/                  rotate.sh used by GitHub Actions
│   └── *.ts                     Catalog scrape, dumps, scrape-cardmarket, benchmarks, diagnostics
│
├── supabase/
│   └── migrations/              17 .sql files, chronological prefix
│
├── docs/                        See README for the doc map
├── public/                      Static assets (logo, icons)
├── results/                     Benchmark CSV outputs
├── backups/                     Catalog snapshots
└── proxy.ts                     Next.js 16 middleware (renamed from middleware.ts)
```

---

## 🧭 App Router conventions

Next.js 16 uses route groups and server-first rendering.

### Route groups

- `(app)` — authenticated routes, share `(app)/layout.tsx` (UserContextProvider, sidebar, BottomNav, InstallPrompt, RouteChangeRefresher).
- `(auth)` — public auth routes (login).

### Server vs client components

By default, components in `app/` are server components. Only files marked with `'use client'` at the top are client components.

| Module | Server component | Client component |
|---|---|---|
| `app/(app)/pokedex/page.tsx` | ✓ (fetches all cards in parallel) | `<PokedexGrid>` etc. are client (interactivity) |
| `app/(app)/vinted/page.tsx` | ✓ | `<VintedList>` is client (filters, modals) |
| `app/(app)/stock/page.tsx` | ✓ | `<StockList>` is client |
| `app/(app)/dashboard/page.tsx` | ✓ (5 parallel Supabase queries) | Charts are client (Recharts) |

### API routes

Every mutation goes through `app/api/<resource>/route.ts`. Auth is checked via `createClient()` (which reads the Supabase session cookie) for user-triggered endpoints, or via `Authorization: Bearer $CRON_SECRET` for cron.

### Async params (Next.js 16)

`params` is async — destructure with `await`:

```ts
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  ...
}
```

---

## 📷 Data flow: scan pipeline

You point your phone at a card. Three seconds later, it's in the database.

Here's what happens behind the scenes:

```
Browser (mobile or desktop)
  │ Photo file
  ▼
[CardScanForm] (client)
  │ FormData with photo
  ▼
POST /api/ocr
  │ Try Gemini 3.1 Flash Lite (primary)
  │   → if timeout/error/parse-fail → fallback to Google Vision
  ▼
{ text, fields, _engine, _usage, _cost }
  │
  │ Client passes fields to /api/enrich
  ▼
POST /api/enrich
  │ Strategy 1: tcg_catalog by code (set_code + set_number + language)
  │ Strategy 2: tcg_catalog by total (printed denominator)
  │ Strategy 2.5: tcg_catalog by name + setNumber, disambig by illustrator
  │ Strategy 3a: TCGdex subseries probe (TG/GG/SWSH+/XY+/SM+/SVP+/BW+/HGSS+)
  │ Strategy 3b: TCGdex blind probe by national-dex
  │ Strategy 3: TCGdex live (fuzzy + direct)
  │ Strategy 5: Gemini-only fallback (KO/CN exotic)
  ▼
{ bestMatch: EnrichedCard | null, candidates[] }
  │
  │ Client pre-fills form, user confirms
  ▼
POST /api/cards (single) or /api/cards/batch (multiple)
  │ Photo upload to card-photos bucket
  │ Insert row(s) in cards
  │ If status=pokedex and slot occupied → 409 with existingCard payload → swap modal
  ▼
{ card, success } → toast confirm, navigate or chain next scan
```

The pipeline is wired in [`../components/submit/CardScanForm.tsx`](../components/submit/CardScanForm.tsx). The OCR and enrichment routes are designed to be reusable from `/submit/scan`, `/submit/batch`, and the inline scanner inside the Pokédex drawer.

---

## 💰 Data flow: pricing pipeline

Every card in your for-sale pile gets a Cardmarket price. No manual lookup, no stale data.

The pricing system has two execution paths: **daily cron** and **single-card refresh on demand**.

```
                       ┌─────────────────────────────────────┐
                       │ GitHub Action (daily 01:07 UTC)    │
                       │ npm run upload-cardmarket-dumps    │
                       └──────────────┬──────────────────────┘
                                      │ Refreshes 3 tables from S3
                                      ▼
                       cardmarket_expansions (~741 rows)
                       cardmarket_products  (~67K rows)
                       cardmarket_pricing   (~67K rows)


                       ┌─────────────────────────────────────┐
                       │ Vercel cron (daily 02:00 UTC)      │
                       │ POST /api/prices/update             │
                       │ Authorization: Bearer $CRON_SECRET  │
                       └──────────────┬──────────────────────┘
                                      │
   200 oldest for_sale cards          ▼
   (cm_updated_at ASC NULLS FIRST)    │
   parallelism 10                     │
                                      ▼
                              ┌────────────────────────────┐
                              │ resolvePricing(card)       │
                              └─────┬──────────────────────┘
                                    │
                                    ▼
                  lookupCardmarketPricing(card) [lib/api/cardmarket-pricing.ts]
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
  Set name → expansion        FAST PATH                 FALLBACK
  ─────────────────           ─────────                 ────────
  - raw, paren-stripped        cardmarket_card_index    cardmarket_products
  - game-prefix-stripped       (id_expansion,           (name prefix
  - catalog cross-ref           set_number)               match)
  - TCGdex bridge for FR        → 1-3 idProducts        → many idProducts
  - token-sort fuzzy            (exact)                 (heuristic)
                                Index built by SQL
                                formula from dump (see
                                CARDMARKET_MAPPING.md).
                                Playwright scraper is
                                the fallback for wheel-
                                type promo sets.
                                    │                           │
                                    └─────────────┬─────────────┘
                                                  ▼
                                  pickFromProductIds(candidates, card)
                                  - Fetch pricing rows
                                  - Disambig: PREMIUM_TIERS (SAR/AR/SR) → highest avg
                                              else → lowest avg
                                  - Reverse-holo? → use *_holo columns
                                                  ▼
                                  { idProduct, low, trend, avg, urlPath, ambiguous }
                                                  │
                          If miss, fallback to TCGdex live
                                                  ▼
                                  Update cards row:
                                    cm_price_low, trend, avg
                                    cm_updated_at, cardmarket_id, cardmarket_url
```

The single-card path (button in PokedexDrawer / Annonce modal) follows the same pipeline but with auth via Supabase session and updates one row.

---

## 👥 Data flow: listings (multi-user)

Your partner has her own Vinted account. The collection is shared. The listings are not.

```
cards (shared)              card_listings (per-user)
  id          uuid PK       card_id    uuid FK → cards
  status      enum          user_id    uuid FK → auth.users
  ...                       listed_at  timestamptz
                            (PK: card_id + user_id)

RLS:
  - reads: any authenticated user (data is shared)
  - writes: only auth.uid() = user_id
```

**When user A clicks "List on my Vinted" for a card:**
- POST `/api/listings/card/<card_id>` with `Authorization` from session
- Inserts `(card_id, user_id_A, NOW())` into `card_listings`
- RLS prevents user A from inserting `(card_id, user_id_B, ...)`

**When user B looks at the same card:**
- VintedRow renders `<ListingBadges>` with both my-listing + partner-listing chips
- Each chip uses the identity color of the corresponding user

**When user A marks the card sold:**
- PATCH `/api/cards/<card_id>` with `status='sold'` + `sold_by_user_id=A`
- If user B also has an active listing → `<PartnerCleanupModal>` appears: "Demande à [B] de retirer son annonce"

**The "Refresh stamp" chip:**
- Click → `<ConfirmDialog>` → POST `/api/listings/card/<card_id>` (upsert with `listed_at = NOW()`)
- Effectively re-stamps the listing for Vinted's bump algorithm

---

## 🧩 Key modules

The business logic lives outside of React. Here's where to find it.

### `lib/api/`

| File | Purpose |
|---|---|
| `gemini-vision.ts` | Primary OCR. Single API call, structured JSON output, `thinkingConfig: { thinkingBudget: 0 }` to prevent invisible thinking. |
| `vision.ts` | Google Cloud Vision fallback OCR. Raw text + bounding boxes. |
| `tcg-catalog.ts` | Local catalog lookups: `lookupByCode`, `lookupByTotal`, `lookupByNameAndLocalId`, `disambiguateByName`, `disambiguateByIllustrator`, `formatBilingualName`, `deriveCardNameFr`. |
| `tcgdex.ts` | TCGdex live API client. |
| `tcgdex-set-mapping.ts` | EN ↔ FR set name translation via TCGdex. Negative cache for failed languages. |
| `cardmarket-pricing.ts` | Pricing lookup pipeline. FAST PATH via `cardmarket_card_index` (populated by SQL formula from the daily dump — see [CARDMARKET_MAPPING.md](CARDMARKET_MAPPING.md)), fallback via `cardmarket_products` name-prefix matching. Rarity-aware disambig. |

### `lib/utils/` (pure helpers, all unit-tested)

| File | Purpose |
|---|---|
| `group-cards.ts` | Group cards by (card_id_tcg, language, condition, variant). Head selection prefers `for_sale`. |
| `vinted-sort.ts` / `vinted-filter.ts` | Sort + filter for Vinted list. State chips logic. |
| `listing-stale.ts` | 28-day Vinted bump threshold. |
| `restock-detection.ts` / `promote-detection.ts` | Post-sold workflow logic. |
| `pokedex-mismatch.ts` / `pokedex-swap.ts` | Pokédex slot validation + swap proposal. |
| `vinted-template.ts` / `lot-template.ts` | Annonce text generators with shipping block. |
| `image-postprocess.ts` / `resize-image.ts` | Pre-OCR image normalization. |
| `parse-set-number.ts` / `extract-from-words.ts` | Set number disambiguation from OCR text + bounding boxes. |
| `split-bulk-price.ts` | Cents-int safe split for bulk vendu. |
| `listings.ts` / `user-colors.ts` / `labels.ts` | Multi-user identity + variant labels + rarity colors. |
| `build-batch-rows.ts` | Bulk INSERT row builder for `/api/cards/batch`. |
| `validate-card-form.ts` | Shared backend validation for card POST/PATCH routes. |
| `dashboard-queries.ts` | KPI + chart helpers. |
| `ocr-cost.ts` / `stock-value.ts` / `manual-dump.ts` | Cost log, snapshot computation, backup payload builder. |
| `format-staleness.ts` | 4-tone freshness label. |
| `categorize-pricing-card.ts` | Cron skip / backfill / lookup decision. |
| `pwa-install.ts` | Platform detection (iOS / Android / standalone) for install flow. |

### `lib/supabase/`

Three client variants:
- `browser.ts` — for use in client components (anon key, RLS applies).
- `server.ts` — for use in server components and API routes (reads session from cookies).
- `service.ts` — for use in cron / background scripts (service role key, bypasses RLS).

### Pure component patterns

A few components share logic across multiple contexts:

- `<EditablePriceCell>` — accepts `endpoint` prop so it works for both `/api/cards/[id]` and `/api/lots/[id]`.
- `<SoldModal>` — uses discriminated union `entity: { kind: 'card'; card } | { kind: 'lot'; lot }` for shared logic between cards and lots.
- `<RefreshPriceButton>` — generic refresh trigger, consumed by Pokédex drawer + Vinted Annonce modal.

---

## 🧪 Testing strategy

Tests live where the logic lives — in the helpers.

Vitest + happy-dom. Tests focus on pure helpers; UI components are tested through helper coverage.

```
lib/utils/*.test.ts   ← bulk of the suite (24+ helper modules)
lib/api/*.test.ts     ← cardmarket-pricing, tcg-catalog
scripts/*.test.ts     ← snapshot-catalog, scrape-limitlesstcg
```

A typical test:
```ts
import { describe, it, expect } from 'vitest';
import { groupCards } from './group-cards';

describe('groupCards', () => {
  it('groups duplicates by (card_id_tcg, language, condition, variant)', () => {
    const cards = [makeCard({ ... }), makeCard({ ... })];
    const groups = groupCards(cards);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
  });
});
```

UI smoke is covered by the development workflow itself — you run the actual flows daily.

### Running

```bash
npm test               # single run
npm run test:watch     # watch
npm run typecheck      # tsc --noEmit
npm run lint
```

CI runs typecheck + tests on every commit (configured via Vercel previews).
