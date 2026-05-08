# Tech debt

You're looking at the catalog of deferred items. Each one passed a deliberate cost-benefit check — the 1,445-line `CardScanForm` that earns its size, the 8 ad-hoc modals waiting on a primitive migration, the heuristic Cardmarket disambig that handles 95 % of cases. The trade-offs stay visible here, not buried in commit history.

---

## 🧱 Component size

### `CardScanForm.tsx` — 1,445 lines, 24 `useState` calls

The heart of the scan flow. UI sub-components (`Field`, `Input`, `Select`, `CandidatePicker`) were extracted to `CardScanFormUI.tsx`, but the orchestration is still monolithic.

**Natural decomposition** (would drop the main component to ~600 lines):
- `usePhaseMachine()` — `phase: 'idle' | 'scanning' | 'reviewing' | 'saving' | 'success' | 'error'` + transitions
- `useOcrPipeline()` — `ocrText`, `ocrUsage`, `ocrEngine`, `ocrIllustrator`, `ocrGemini`, plus the `runOcr()` action
- `useEnrichment()` — `candidates`, `enrichFound`, `researching`, `researchMsg`, plus `runEnrich()` and `applyEnriched()`
- `useDuplicateHandlers()` — `duplicateForSaleConflict`, `duplicatePhotoModal`, `replaceModal`

**Why deferred:** the file works in production, has subtle inter-state dependencies (e.g. enrichment can re-trigger after a candidate pick, which resets the suggestion), and the cost of an undiscovered regression on the main user flow outweighs the readability gain. A dedicated session with end-to-end manual smoke tests after each extraction is the right approach.

**Estimated effort:** 3-4 hours focused work, ideally with the dev server running side-by-side.

### `VintedList.tsx` — modal orchestration

The sold → restock → promote → partner-cleanup chain (~200 lines, ~6 interrelated `useState` hooks) is still inline in [VintedList.tsx](../components/vinted/VintedList.tsx). Three hooks already extracted: `useDataSync`, `useSelectionMode`, `useStockCount`.

**Natural extraction:** `useVintedSoldFlow()` taking the user context and returning `{ soldTarget, restockAlert, promoteCandidate, partnerCleanup, partnerCleanupQueue, handleSold, handlePromoted, dismissPartnerCleanup, ... }`.

**Why deferred:** the chain has implicit ordering (partner cleanup only fires after promote dismisses; the bulk variant queues partner cleanups separately) that's painful to express in a hook signature without leaking implementation. Worth doing in conjunction with a `<VintedModalRenderer>` component that takes the hook output and renders the right modal.

**Estimated effort:** 1-2 hours.

---

## 🪟 Modal primitive migration

The `<Modal>` primitive in [components/ui/Modal.tsx](../components/ui/Modal.tsx) handles backdrop, Escape key, click-outside, body scroll lock. Three modals migrated as proof: `ConfirmDialog`, `CardZoomModal`, `RetireListingModal`. Eight remain on ad-hoc implementations.

**Remaining modals to migrate:**
- `AnnonceModal.tsx`
- `BulkSoldModal.tsx`
- `BulkSoldRecapModal.tsx`
- `LotAnnonceModal.tsx`
- `MoveToPokedexModal.tsx`
- `DuplicatePhotoModal.tsx`
- `DuplicateForSaleModal.tsx`
- `PokedexCardActionsModal.tsx`

**Each migration is mechanical** — replace the wrapper `<div className="fixed inset-0 ...">` + Escape handler + click-outside with `<Modal open onClose ariaLabel className>`. ~10 minutes per file. The risk is per-file: if a modal has custom layout (carousel, full-screen image), the layout prop variants (`fullscreen`, `bottom-sheet`, `drawer-right`) cover most cases.

**Why deferred:** purely incremental. No user-visible change. Touch them when the surrounding code needs work anyway.

**Note:** `PokedexDrawer.tsx` is intentionally NOT a Modal — its custom mobile-bottom-sheet morphing into desktop-side-drawer doesn't fit the primitive's layout enum and the manual implementation is fine.

---

## 🧪 Testing

### Test runner needs Node 22

Vitest 4.x requires `node:util.styleText` which is Node 22+. The `package.json` engines field says `>=22.0.0` but the dev environment occasionally runs on Node 18 (system default). Workaround: `nvm use 22` before `npm test`.

**Fix:** none needed — pin in CI, document in SETUP.

### UI components not tested

Helpers in `lib/utils/` are unit-tested (39 test files, 344 passing). UI components are only validated through manual usage.

**Why:** purposeful. Components are intentionally thin wrappers around helpers (see [ARCHITECTURE.md](ARCHITECTURE.md) "Pure helpers, thin components"). Adding component tests would lock down implementation details (which DOM elements render, which class names) without adding behavioral coverage the helpers don't already provide.

**When to revisit:** if a UI component grows logic that doesn't naturally fit a helper (e.g. complex state machines), wrap it in a hook and test the hook.

### No end-to-end tests

No Playwright / Cypress suite. Critical flows (scan → enrich → save, sold → restock → promote, bulk vendu) are covered manually before each commit.

**Why:** the test surface is large (5 OCR languages × 4 statuses × variants × multi-user flows) and the real OCR/Cardmarket APIs are non-deterministic. Mocking enough to make E2E reliable would essentially be re-implementing the system. The honest version: helper tests + manual smoke + production usage by the actual users.

**When to revisit:** if I ship to a third user, or if regressions start slipping past manual testing.

---

## 💰 Pricing accuracy

### Heuristic disambig for non-modern sets

The Cardmarket gallery scrape was run on the SV+ era (281 modern sets), populating `cardmarket_card_index` for ~40k products. Older cards (XY, BW, Sun & Moon era) fall back to name-prefix matching on `cardmarket_products`, which can pick the wrong print when multiple variants of the same card share a card_prefix in the same expansion.

**Mitigation in place:** the disambig heuristic (`pickAmbiguousIndex` with `PREMIUM_TIERS`) handles 95% of cases by tone-matching variant + rarity to highest/lowest avg price.

**Real fix:** scrape `--all` (741 expansions, ~10h overnight). The plumbing is in place, but Cardmarket's rate limiting requires careful pacing.

### Per-card metadata scrape (Scenario B)

Originally planned to scrape Cardmarket product detail pages for ground-truth rarity/species, but abandoned during build:
- Cardmarket's rate-limit threshold is aggressive (HTTP 429 after ~6 rapid requests)
- 40k+ pages × adaptive concurrency = 24h+ of risky scraping
- Probe found that Cardmarket pages **don't** expose illustrator (which would have been the killer feature) — net data added is just `rarity` (already inferred well by the heuristic)

**Won't do** unless heuristic disambig produces measurable wrong matches in production.

### `tcg_catalog.set_code` lookup uses ilike

Current `lookupByCode` uses `ilike` (case-insensitive) which forces a full table scan on the 52K-row catalog. Band-aid: 5s timeout on `withTimeout`.

**Real fix:** add a functional index `CREATE INDEX tcg_catalog_set_code_lower_idx ON tcg_catalog (lower(set_code), language)` and rewrite the lookup to query on `lower(set_code)`.

**Estimated effort:** 1 migration + 1 query change = 30 min.

---

## ⚙️ Operational

### Card photos inlined in `cards.image_url`

Card photos are uploaded to the `card-photos` bucket and the public URL is stored in `cards.image_url`. The daily backup workflow dumps the `cards` table but **not** the bucket contents. If the bucket is wiped, photos are gone (the catalog `tcg_image_url` fallback stays available, so cards aren't useless — just lose the user-uploaded copy).

**Fix:** dump the bucket contents into the same release, or sync the bucket to a separate backup bucket nightly.

**Estimated effort:** 1 GitHub Action job, ~1 hour.

### No UI for restoring from a backup

Backups exist (manual + GitHub Action releases) but restore is a manual `psql < dump.sql` operation. No UI to import a backup file.

**Why deferred:** restore is a low-frequency action that benefits from the safety of being explicit. The trade-off (UI ergonomics vs. risk of accidental restore wiping live data) makes a CLI-only path defensible for a 2-user app.

**Won't do** unless multi-user grows and accidental data loss becomes likely.

### `stock_value_snapshots` table still written, never read

The daily pricing cron writes to `stock_value_snapshots` (1 row/day) but the dashboard chart consuming it (`StockValueLineChart`) was removed. The table grows ~365 rows/year, harmless but noisy.

**Fix:** drop the table + remove `snapshotStockValue` from [`prices/update/route.ts`](../app/api/prices/update/route.ts), OR re-add the chart in a future iteration. Currently leaning toward keeping it written in case a future chart wants it.

---

## 📚 Documentation

### Screenshots not captured

[docs/SCREENSHOTS_TODO.md](SCREENSHOTS_TODO.md) lists what to capture and where to drop the files. Empty `docs/screenshots/` folder waiting for content.

**Why deferred:** screenshots require the dev server running with seeded test data (or production-like data) — easier to do in one focused session than incrementally.

### Some inline comments reference outdated phases

A handful of `// Phase 2.1: ...` / `// Phase 4 follow-up` comments remain in the code. They were useful during build but are now archeology.

**Cleanup:** trivial grep + replace, low priority. They're not wrong, just historical.

---

## 🚫 Won't do

What stays untouched, no matter how the project grows. These are intentionally out of scope and will not be built unless the project grows beyond its current 2-user scope:

- **Public signup** — auth is whitelist by design (only the 2 user accounts created at install time).
- **Multi-language UI** — French only. The user-facing copy is FR. Adding i18n to a 2-user app is over-engineering.
- **Mobile native apps** — the PWA covers the use case; native would require 3 codebases.
- **In-browser image editor** — users either accept the camera capture or re-take. No crop/rotate/filter tools.
- **OCR for non-Pokémon TCG** — the catalog, prompts, and matching strategies are Pokémon-specific. Generalizing would require rebuilding most of the enrichment pipeline.
- **Cardmarket marketplace integration** — the Cardmarket API closed to new applicants in 2023. We mirror the public S3 dumps for pricing; we don't list/buy/sell through Cardmarket programmatically.

---

## 🎯 Assessment

The codebase is feature-complete and used daily for its intended purpose. The remaining items are largely **incremental polish** (modal migrations, component splits) or **deliberate trade-offs** (heuristic disambig vs. per-card scrape, no UI restore vs. CLI restore). None block any user-facing functionality.

For a portfolio reader: this doc is the answer to *"what would you fix if you had another two weeks?"* — and the implicit answer to *"do you know when to stop?"*
