# Changelog

Every phase here is a coherent feature increment that ended on a green test suite. Most recent first — read top-to-bottom for the build narrative, or jump to a specific phase.

> Each phase ships with `npm test && npm run typecheck && npm run lint` all clean.

---

## 💰 Phase 7 — Cardmarket pricing system (May 2026)

**The problem**: TCGdex's live API was too slow for real-time pricing. **The fix**: mirror Cardmarket's official S3 dumps locally and build an exact-match pipeline backed by per-expansion gallery scrapes.

**Shipped**:
- Mirror Cardmarket's public S3 dumps (`products_singles_6.json`, `price_guide_6.json`) into 3 Supabase tables. Daily refresh via GitHub Action.
- `cardmarket_card_index` table populated by Playwright scrape of expansion gallery pages — gives exact `(expansion, set_number) → idProduct` lookup.
- 6-strategy lookup helper [`lib/api/cardmarket-pricing.ts`](../lib/api/cardmarket-pricing.ts): set-name fuzzy match (raw + paren-stripped + game-prefix-stripped + catalog cross-ref + TCGdex bridge for FR locales) with token-sort fallback for word-reordered names.
- Hardened scraper with adaptive 429 handling: 2.5s/page + 5–8s/expansion delays, 3 retries with exponential cooldown (60s/120s/180s), kill switch at 5 cumulative 429s. Resume-safe.
- `--all` flag scrapes all 741 expansions; `--modern` for SV+ era only; targeted scrape via [`scripts/recommend-scrape-targets.ts`](../scripts/recommend-scrape-targets.ts).
- Cardmarket URL link in UI — every priced card shows "View on Cardmarket ↗" so the user can verify the matched product page.
- TCGdex live API stays as fallback for cards not in the Cardmarket dumps (rare edge cases).
- 3 new migrations: `cardmarket_dumps`, `cardmarket_card_index`, `cardmarket_url_path`.

**Not shipped** (deferred):
- Per-card metadata scrape (rarity ground truth from CM detail pages) — abandoned after probe showed CM lacks illustrator field, and the heuristic disambig already works post-`PREMIUM_TIERS` fix.

---

## 🚀 Phase 6 — PWA installability (May 2026)

**The goal**: make I.R.I.S installable on iOS and Android, accessible from the home screen like a native app. One codebase, zero app stores.

**Shipped**:
- `app/manifest.ts` declaring the PWA (name, start_url, display:standalone, theme color, lang).
- Icons set: 192/512/512-maskable PNG in `public/icons/`, plus `app/apple-icon.png` (180px) and `app/icon.png` (favicon).
- Auto-show install banner [`<InstallPrompt />`](../components/layout/InstallPrompt.tsx):
  - Chrome/Edge/Android: listens for `beforeinstallprompt`, shows native install button, 14-day TTL on dismissal.
  - iOS Safari: shows "Comment ?" banner that opens illustrated 3-step modal (Share → Sur l'écran d'accueil → Ajouter).
  - Auto-hides in standalone mode.
- Manual install section in Options page [`<PWAInstallSection />`](../components/options/PWAInstallSection.tsx) — always-visible card adapting to platform (installed / Chrome button / iOS instructions / unsupported message).
- Pure platform-detection helper [`lib/utils/pwa-install.ts`](../lib/utils/pwa-install.ts) — `detectInitialPlatform()`, `isStandalone()`, `isIos()` (handles iPadOS reporting MacIntel).

---

## 📊 Phase 5 — Dashboard + backups (May 2026)

**At the end of the day, you want the whole picture.** A dashboard that answers in one screen. Plus hardened backups — manual and automated — to never lose the inventory.

**Shipped**:
- Dashboard page (`/dashboard`, 6th sidebar tab):
  - 4 KPI tiles: stock value, OCR cost 30d, scan count 30d, restock alerts.
  - 4 charts in 2×2 grid (Recharts): cost stacked bar, stock-value area, rarity drill-down donut, 52-week scan heatmap (custom SVG).
  - Top 10 rares table with deep-link to drawer.
  - Restock alerts list.
- Server component fans out 5 parallel Supabase queries.
- Pure helpers [`lib/utils/dashboard-queries.ts`](../lib/utils/dashboard-queries.ts) testable in isolation: `buildRarityCounts`, `topRaresByPrice`, `buildHeatmapMatrix`.
- Manual backup UI on Options page: dump 8 user tables to gzipped JSON in `manual-backups` bucket, signed-URL download (1h expiry), delete action.
- GitHub Action for daily automated backup: `pg_dump --data-only`, gzipped, published as tagged release. Rotation 30 daily / 12 weekly / 12 monthly.
- Catalog snapshot/restore scripts versioned in git: `npm run snapshot-catalog` / `npm run restore-catalog`.
- Pricing constant extracted: `PRICE_COEFFICIENT = 0.85` in [`lib/constants/pricing.ts`](../lib/constants/pricing.ts).
- Form validation factored: [`lib/utils/validate-card-form.ts`](../lib/utils/validate-card-form.ts), de-duplicated 117 lines across 2 cards routes.
- Migrations: `phase5_dashboard` (ocr_usage_log + stock_value_snapshots), `phase5_manual_backups_bucket`.

**Tests**: 344 passing, 37 files.

---

## 👥 Phase 4 — Multi-user collaboration (May 2026)

**The constraint**: two users, one inventory, two Vinted accounts. Each needs to see who's listing what, track their own sales, and coordinate restocks without collisions.

**Shipped**:
- New tables: `user_profiles`, `card_listings`, `lot_listings`. RLS scoped by `auth.uid()` for writes.
- `sold_by_user_id` on cards + lots — track who marked the sale.
- Identity colors: `--color-user-lui` (blue) and `--color-user-elle` (pink) used across the UI.
- Per-user listing state: `<ListingBadges>` shows "Listed by Me" / "Listed by [partner]" / "Take down" / "Refresh".
- Cross-user flows: `<PartnerCleanupModal>` (post-restock notice when partner is also listing), `<RouteChangeRefresher>` (auto-refresh on inter-tab nav), `<LotSoldRow>` (read-only sold lot), `<SaveSuccessModal>` (insert recap).
- Hook `useUserContext` exposed via `(app)/layout.tsx` Provider.
- Pure helpers: [`lib/utils/listings.ts`](../lib/utils/listings.ts), [`lib/utils/user-colors.ts`](../lib/utils/user-colors.ts).
- Variant `stamp` added to `VARIANT_LABEL`.
- Sold flow rework: SoldModal → restock proposal → if no replacement + partner has listing → PartnerCleanupModal.
- Migrations: `phase4_multi_user`, `sold_by_user`.

**Phase 4 closeout** (May 2026):
- Vinted import attempt (cleaned up, see git history).
- `lookupByCode` switched to `ilike` (fix case-sensitivity bug — JP `SV11B` was missing 100% of hits).
- "À rafraîchir" chip → confirm modal → POST `/api/listings` upserts `listed_at = NOW()`.
- `<RetireListingModal>` + `<StockCountChip>` for inline stock management on Vinted rows.
- Trainer card support end-to-end: nullable `pokemon_number` and `pokemon_name`. New `card_name_fr` Gemini field for FR translation of Trainers.
- Batch endpoint `POST /api/cards/batch` — 1 photo upload + 1 SQL bulk INSERT for N copies. Save-count=10 went from ~8s to ~1.1s (-85%).
- `/submit` UX: fixed-height desktop layout, only the form scrolls. Custom thin scrollbar.

**Tests**: 316 passing, 31 files.

---

## 🌐 Phase 3c — Bulk vendu + token optimization + multilang resilience (May 2026)

**3 themes**:

1. **Bulk vendu on `/vinted`**: selection mode toggle, accent-red checkbox per row, `<BulkSelectionBottomBar>`, `<BulkSoldModal>` (live `splitPrice` cents-int preview), sequential PATCH with restock+promote capture, recap modal carousel + inline restock chained `<PromoteAfterSoldModal>`. Lots respect state chips. `groupCards` head selection prefers `for_sale`.

2. **Gemini token optim**: `usageMetadata` extracted + EUR cost (USD_TO_EUR=0.92), `maxOutputTokens=300`, prompt rewrite from 500→360 tokens (multi-language with JP/EN/FR/CN/KO examples + anti-hallucination warning). **`thinkingConfig: { thinkingBudget: 0 }` critical** (without it Gemini 3 burns budget on invisible thoughts → systematic Vision fallback). Parser tolerates prose+markdown fences. `_engine` propagated to UI for debug. Resize 1600→1400px. Model switched `gemini-3-flash-preview` → `gemini-3.1-flash-lite-preview` (5/5 acc, −43% cost). **Cost/scan: ~€0.00042**.

3. **Multilang enrichment resilience**: `lookupSubseries` (TG/GG/Promo via parent set probes + dex disambig), `probeSubseriesByDex` (last-chance for hallucinated setCodes), Strategy 2.5 `lookupByNameAndLocalId` + `disambiguateByIllustrator` (auto-pick), Strategy 5 Gemini-only fallback (KO/CN), Gemini `language` propagated to form (was sniffed as JP-only).

4. **UI polish**: mobile camera/gallery picker (drop `capture="environment"`), `UI_LANGUAGES = ['JP','EN','FR','KO','CN']`, illustrator extracted + displayed in OCR snippet, ZH→CN rename end-to-end.

5. **Catalog scraper Phase 3c**: `parseIllustrator` + `enrichWithIllustrators` (concurrence 5, toggle `SCRAPE_ILLUSTRATOR=1`, ~3h full re-scrape) + DB-driven resume.

Migrations: `rename_zh_to_cn`, `tcg_catalog_illustrator`. **Tests**: 279 passing.

---

## 📦 Phase 3b — Lots + bulk import (April–May 2026)

**The pivot**: trying to list 20 individual photos with per-card OCR was too slow and unreliable. **The fix**: introduce `lots` as a distinct entity — bundle, multi-photo dropzone, live annonce preview.

**Phase 3b1**: Lots Vinted (bundles). 5-field quick form + multi-photo dropzone, live annonce preview. Templated description with shipping block. `<LotForm>`, `<LotRow>`, `<LotAnnonceModal>` (carousel + chevrons + dot indicators + arrow keys, copy clipboard, anti-bot image download). Reuses `EditablePriceCell` + `VintedListedToggle` extended with optional `endpoint` prop. `SoldModal` extended with discriminated union `entity: { kind: 'card' | 'lot' }`. Migration `lots_vinted_bundle`.

**Phase 3b2**: Bulk import via 4th `/submit` tab "Batch" (≤30 photos, OCR+enrich pre-batched in parallel then `CardScanForm` chained card-by-card with auto-advance). Status conflict for_sale → 409 actionable server-side with `existingCard` payload (photo + price + meta). `<DuplicateForSaleModal>` proposes `[Cancel] / [Add to Stock]`. Helper `lib/utils/resize-image.ts` default 1600px (tested 1024 but 8/30 cards failed in prod, reverted). Status dropdown + Quantity field (POST loop × N, fallback collection on subsequent copies if Pokédex). Search Vinted extended to lots.

**Tests**: 242 passing.

---

## ⏰ Phase 3a — Daily pricing cron (May 2026)

**Keep prices fresh without manual refreshes.** Vercel cron runs daily at 2 AM UTC, updates the oldest 200 cards in bulk, and never touches user-controlled annonce prices.

Vercel cron `0 2 * * *` UTC via TCGdex (`POST /api/prices/update`, protected by `CRON_SECRET`). Bulk mode (LIMIT 200, parallelism 10, oldest first via `cm_updated_at ASC NULLS FIRST`) + single-card mode (`?card_id=X` behind Supabase auth). Pure helpers: `categorize-pricing-card` (skip variant/KO/ZH, auto-backfill), `format-staleness` (4 tones). UI components `<PriceFreshnessBadge>` + `<RefreshPriceButton>` integrated in VintedRow / StockRow / PokedexDrawer. **Cron never touches `suggested_price`** (renamed "Annonce" in UI, 100% user-controlled via `EditablePriceCell`). Cron only writes `cm_price_low/trend/avg` + `cm_updated_at` + auto-backfill `card_id_tcg`/`cardmarket_id`.

**Tests**: 218 passing.

---

## 💸 Phase 2 — Vinted module (April 2026)

**You've scanned the cards. Now sell them.** A dedicated Vinted listing page with FIFO queuing, grouped rows, inline price edits, sold actions, and one-tap annonce generation.

**Phase 2 (initial)**: FIFO list + variant-aware grouping (`card_id_tcg + language + condition + variant`), inline price edit, "Sold" action + restock toast, annonce generator with smart-truncated 80-char title + clipboard.

**Phase 2.1**: Restructure into 2 distinct pages (Stock + Vinted) + `vinted_listed_at` for "published on Vinted.com" tracking (3-state toggle offline/online/stale). Pokédex enriched (1025 names FR+EN, exact-number search, replace modal with Stock/Vinted choice, inline scanner from drawer, hard mismatch block via `pokemon_number`). Stock as Vinted mirror (grouping, Pokédex tag, count chip, clone endpoint, sort date_added ASC). Shared `MoveToPokedexModal` (Stock+Vinted). AnnonceModal redesign (PiP mobile, anti-bot Download img, templates v2 with condition/language mapping). Options page (6th tab) with ThemeToggle + SignOut. RPC `replace_pokedex_card` fixed in 3-step. Vinted filters = mutually exclusive chips. 7 new pure helpers. 2 new migrations.

**Tests**: 199 passing.

---

## 🔍 Phase 1.13 — Scanner + Pokédex view modes (April 2026)

**Make the scanner friendlier and the Pokédex flexible.** FR translations from Gemini, 2-column scanner UI with magnifier loupe, and 3 view modes for the Pokédex.

FR translations via Gemini (4 new fields `pokemon_number`, `pokemon_name_fr`, `set_name`, `set_name_fr`) → displayed names `"FR (Original)"` (e.g. `"Gruikui (チャオブー)"`). Scanner UI 2-column desktop + magnifier loupe 1.5× + variant dropdown + notes. Pokédex 3 view modes (grid-large / grid-compact / list) persisted in localStorage. Migration `add_cards_variant`.

**Tests**: 116 passing.

---

## 📷 Phase 1.12 — Gemini OCR primary (April 2026)

**Accuracy over speed.** Switched OCR primary from Google Vision to Gemini 3 Flash Preview. Bench: 28/30 (93%). Vision kept as fallback. Cost: ~6¢/month for 100 scans.

Switched OCR primary from Google Vision to Gemini 3 Flash Preview. Structured JSON extraction. Bench: 28/30 (93%). Vision kept as fallback. Cost: ~6¢/month for 100 scans.

**Tests**: 97 passing.

---

## 📚 Phase 1.11 — Local TCG catalog (April 2026)

**Stop relying on live APIs for enrichment.** Scrape and cache 111K cards locally. Post-scan enrichment jumped from 33% to 63-73%.

Local catalog via LimitlessTCG scrape. 111K cards JP/EN/FR/DE/IT/ES/PT (later wiped DE/IT/ES/PT in Phase 3c). Post-scan enrichment goes from 33% to 63-73% (test bench).

**Tests**: 81 passing.

---

## 🏗️ Phase 1 — Foundation (March 2026)

**Everything starts here.** Auth, layout, OCR (Vision), TCGdex enrichment, mobile scan, Pokédex suggestion, Pokédex grid, candidate picker.

Auth, layout, OCR (Vision), TCGdex enrichment, mobile scan, Pokédex suggestion, Pokédex grid, candidate picker.

**Tests**: 52 passing.
