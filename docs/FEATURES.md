# Features

Complete catalog of what I.R.I.S does, organized by user-facing module. For the underlying code map, see [ARCHITECTURE.md](../ARCHITECTURE.md).

## Table of contents

- [Authentication](#authentication)
- [Scanner & enrichment](#scanner--enrichment)
- [Pokédex](#pokédex)
- [Stock](#stock)
- [Vinted](#vinted)
- [Lots (bundles)](#lots-bundles)
- [Pricing](#pricing)
- [Dashboard](#dashboard)
- [Multi-user collaboration](#multi-user-collaboration)
- [Backups](#backups)
- [PWA installation](#pwa-installation)
- [Options](#options)

---

## Authentication

- **Whitelist 2-user model** — public signup is disabled. Two accounts are seeded at install time.
- **Per-user identity** — each user has a `display_name` (set in `user_profiles`) and a CSS color token (`--color-user-lui` / `--color-user-elle`) that propagates across badges, action labels, and listing chips.
- **"Me" stays neutral** — the current user always sees themselves in the default green; the partner gets the identity color. Helps mental tracking when reviewing a list.
- **Session persistence** — Supabase-managed cookies, automatic refresh.

---

## Scanner & enrichment

### Capture
- **Mobile** — native file picker (camera + gallery selection).
- **Desktop** — file input with drag-and-drop hint.
- **2-column layout** (desktop) — image preview on the left with a 1.5× magnifier loupe; form on the right.
- **Live image post-processing** — strip EXIF metadata, downscale to 1600 px max edge, JPEG quality optimized for OCR.

### OCR pipeline
- **Primary engine: Gemini 3.1 Flash Lite Preview** — single API call returns structured JSON with 14 fields:
  - `card_name`, `pokemon_name`, `set_code`, `set_number`, `set_total`
  - `language`, `rarity`, `confidence`
  - `pokemon_number`, `pokemon_name_fr`, `set_name`, `set_name_fr`
  - `illustrator`, `card_name_fr` (for Trainer/Energy cards)
- **Fallback engine: Google Cloud Vision** — automatic when Gemini times out, errors, or returns unparseable output.
- **Engine debug** — `_engine` field propagated to the UI: `Gemini`, `Gemini→Vision`, or `Vision`. Token usage + EUR cost displayed under the snippet.
- **Image rotation** — handled client-side before upload to avoid OCR confusion.

### Enrichment (6-strategy waterfall)
For every scan, the pipeline tries strategies in order until one matches:

1. **Catalog by code** — `lookupByCode(setCode, setNumber, language)` against the local `tcg_catalog` (52K cards). Case-insensitive (handles JP `SV11B` ↔ `sv11b`).
2. **Catalog by total** — `lookupByTotal(total, setNumber, language)` for cards where the printed denominator differs from the official `cardCount` (common in JP).
3. **Catalog by name + local ID** — disambiguates between same-numbered prints using `pokemon_name` + `setNumber`. If Gemini provided `illustrator`, auto-picks via `disambiguateByIllustrator` (single match) — otherwise opens a visual picker UI.
4. **TCGdex subseries probe** — detects patterns like `TG`, `GG`, `SWSH+`, `XY+`, `SM+`, `SVP+`, `BW+`, `HGSS+`, probes parent sets in parallel, disambiguates by national-dex number.
5. **TCGdex blind probe** — last-chance probe of subseries (TG `swsh9-12`, GG `swsh12.5`) when the OCR'd set code is completely off, matched strictly by national-dex.
6. **TCGdex live** — direct fetch + fuzzy text match.
7. **Gemini-only fallback** — for KO / CN / exotic Crown Series cards where catalog + TCGdex both miss. Builds an `EnrichedCard` from Gemini's output; pricing remains null.

### Bilingual name display
For non-EN cards, `applyGeminiEnrichments` reformats `card_name`, `pokemon_name`, `set_name` as `"Translated (Original)"` — e.g. `"Gruikui (チャオブー)"`, `"Iron Crown ex (鋼鉄王ex)"`, `"Mascarade Crépusculaire (Twilight Masquerade)"`.

### Variant + notes
- **Variant dropdown** — `standard`, `pokeball`, `masterball`, `reverse_holo`, `stamp`, `promo`. Affects pricing source (reverse_holo → use holo prices on shared idProducts).
- **Notes field** — free-form for damage / signed / centering notes.
- **Quantity** — single scan can save N copies (1 goes to Pokédex if matching, rest to Stock as `collection`).

### Status routing
- `for_sale` — goes to Vinted pile.
- `collection` — goes to Stock.
- `pokedex` — goes to Pokédex slot (1 per Pokémon).

If Pokédex slot is already occupied → swap modal proposes replacing the existing card (which goes back to Stock or Vinted).

### Bulk import (Batch tab)
- Upload up to 30 photos at once.
- OCR + enrichment run in parallel.
- Then the Scan form is chained card-by-card (same UX as single scan, with auto-advance on save).
- Cap respects Vercel timeout (60s) + Gemini Tier 1 limits (15 req/min).

---

## Pokédex

- **1025 slots** — one per Pokémon in the National Dex.
- **3 view modes** — large grid, compact grid, list. Toggle persisted in localStorage via `useSyncExternalStore`.
- **Search** — by Pokémon number (exact) or French/English name (substring).
- **Click a filled slot** → drawer opens with full card details (image, set, pricing, notes).
- **Click an empty slot** → drawer with "Scan a card" button (inline scanner, locked to that Pokémon number).
- **Replace flow** — when scanning a card whose Pokémon already has a slot, modal proposes: keep the new one (old → Stock or Vinted) or cancel.
- **Mismatch hard-block** — scanner refuses to save into a Pokédex slot if `pokemon_number` doesn't match. Bandeau explains why.

---

## Stock

- **Mirror of physical inventory** — duplicate copies are grouped (same `card_id_tcg + language + condition + variant`).
- **Count chip "× N"** — editable inline. Increase clones the card; decrease deletes the most-recent collection copies.
- **Pokédex tag** — shows whether each card already fills its Pokédex slot. Click "Pas Pokédex" → confirm + sub-flow if Pokédex slot is occupied.
- **Sort** — by date added ASC (oldest first).
- **Move-to-Pokédex modal** — same component used in Vinted, handles the Pokédex slot promotion + swap.

---

## Vinted

- **For-sale pile** — cards with `status = 'for_sale'`.
- **Listings badges** — small chips on each row show "Listed by Me", "Listed by [partner name]", "Take down", and "Refresh stamp" with identity colors.
- **State filters (mutually exclusive chips)**:
  - `Tout` — everything.
  - `Mes annonces hors-ligne` — `for_sale` not yet listed by me.
  - `Mes annonces en ligne` — `for_sale` listed by me, < 28 days.
  - `À rafraîchir` — listed > 28 days (Vinted's bump threshold).
  - `Vendues` — `status = 'sold'`.
- **Type filter** — `Tout` / `Cartes` / `Lots`.
- **Search** — across card_name, pokemon_name, set_name (cards) + name, extra_description, language (lots).
- **Annonce modal** — generates the Vinted listing copy:
  - Smart-truncated title (≤80 chars).
  - Templated description with shipping block.
  - Copy-to-clipboard button.
  - Download card image (PNG, EXIF stripped, anti-bot processed).
  - Picture-in-picture image preview on mobile.
- **Sold modal** — record sold price, optional partial price split if mid-bulk, captures `sold_by_user_id`.
- **Restock toast** — when marking a `for_sale` card as sold, if a `collection` copy of the same card exists, prompts to relist it.
- **Promote-after-sold modal** — chained after restock, lets you bulk-promote remaining cards.
- **Partner cleanup modal** — when restock has nothing to promote AND the partner has an active listing, suggests they take down their listing.
- **Bulk vendu** — toggle "Sélection multiple", checkbox per row, bottom bar shows total + bulk modal walks per-card price split. Recap modal carousel + restock chain.
- **"Stock count" chip** — `📦 × N` displayed if `collection` copies exist; click + input to clone or trim.
- **"Retire listing" X button** — opens modal: move to Stock or delete entirely (with cascade warning if partner is listing too).
- **Image zoom** — click card image → full-screen modal with chevron navigation.

---

## Lots (bundles)

A **lot** is a Vinted listing that bundles multiple cards behind one or more photos.

- **Quick form** — 5 fields: name, price, language, condition, optional description. Plus multi-photo dropzone.
- **Live annonce preview** — see the generated Vinted text before saving.
- **Carousel modal** — chevron navigation + dot indicators + arrow keys for browsing photos.
- **Same lifecycle as cards** — for_sale → sold, with the same price refresh badges and listing badges.
- **No OCR / no Pokédex / no pricing cron** — lots are manual entries.

---

## Pricing

### Sources
- **Cardmarket dumps (primary)** — daily S3 mirror (~67K products + 72K pricing rows). No external API call at lookup time.
- **TCGdex live API (fallback)** — when the dumps don't have a match.
- **Manual price** — for cards where neither source applies (variants without CM equivalent, exotic JP promos).

### Lookup pipeline
1. **Set name → expansion ID** — fuzzy-matched against `cardmarket_expansions` (with HTML decode + token-sort + TCGdex bridge for FR localized names).
2. **(Expansion ID, set_number) → idProduct** — exact lookup via `cardmarket_card_index` (the **fast path**, populated by the gallery scrape).
3. **Fallback when index missing** — name-prefix matching on `cardmarket_products` with rarity-aware disambig.
4. **Pricing fetch** — `cardmarket_pricing` row by `id_product`. Reverse-holo variants use `*_holo` columns where available.

### Display
- **4 prices per card** — Low, Trend, Avg30, "Annonce" (your suggested selling price, never auto-updated).
- **Freshness badge** — 4-tier color (fresh < 7 days, stale 7–30, old > 30, never).
- **Refresh button** — manual refresh per card (single-card endpoint, auth via Supabase session).
- **Cardmarket deep link** — "View on Cardmarket ↗" link below the price block on Pokédex drawer + Annonce modal. Lets you verify the matched product page.

### Cron
- **Daily Vercel cron** at `0 2 * * *` UTC — pulls 200 oldest `for_sale` cards (`cm_updated_at ASC NULLS FIRST`), refreshes via the lookup pipeline, parallelism 10. Auth via `CRON_SECRET`.
- **Daily GitHub Action** at `0 1 * * *` UTC — refreshes the Cardmarket S3 dumps into Supabase.

### Cost (current model)
- ~€0.0004 per OCR scan (Gemini 3.1 Flash Lite).
- $0 per pricing refresh (local lookup).
- $0 per backup (within Supabase + GitHub free tier).

---

## Dashboard

Single page (`/dashboard`) with the following blocks:

### KPI strip (4 tiles)
- **Stock value** — sum of `cm_price_avg` for all `for_sale` + `collection` cards.
- **OCR cost (30 days)** — sum of `cost_eur` from `ocr_usage_log`.
- **Scans (30 days)** — count of OCR calls.
- **Restock alerts** — count of cards where the user has a sold copy but the partner is still listing.

### Charts (2×2 grid via Recharts)
- **Cost bar chart** — daily stacked Gemini + Vision costs.
- **Stock value line chart** — area chart over time, split by status.
- **Rarity donut** — drill-down clicks open `/pokedex?rarity=X`.
- **Scan heatmap** — custom SVG, 52 weeks × 7 days, GitHub-style intensity.

### Tables
- **Top 10 rares** — sorted by `cm_price_avg`, deep-link to drawer.
- **Restock alerts list** — actionable per-card list.

---

## Multi-user collaboration

### Tables
- `cards`, `lots` — shared inventory, both users can read.
- `card_listings`, `lot_listings` — per-user listing state, RLS-scoped writes (you can only insert/delete your own listings).
- `sold_by_user_id` — captures who marked the sale.

### Visual identity
- Each user has a CSS token (`--color-user-lui` blue, `--color-user-elle` pink) used in:
  - Listing badges
  - Sold-by labels
  - Action buttons (when partner-affecting)
- "Me" always renders in default green (no risk of mistaking my own actions for the partner's).

### Cross-user flows
- **Sold flow** — marking partner's listing as sold triggers the cleanup modal: "Le partenaire a aussi une annonce en ligne, lui demander de la retirer ?"
- **Refresh listing stamp** — chip "À rafraîchir" + confirm modal → POST `/api/listings` upserts `listed_at = NOW()` (instant Vinted "bump").
- **Auto-refresh on navigation** — `<RouteChangeRefresher>` triggers a server data refresh whenever the user navigates between tabs.

### Trainer card support
- `pokemon_number` and `pokemon_name` are nullable (Trainers / Energies have no Pokémon).
- Pokédex grid hides slots where `pokemon_number` is null.
- Scanner shows "Carte non-Pokémon — pas de slot Pokédex" for non-Pokémon cards.
- Gemini extracts `card_name_fr` for Trainers (e.g. "Le Plan de N" for "Nの筋書き").

---

## Backups

### Daily automatic (GitHub Actions)
- Runs `pg_dump --data-only` on 8 user-data tables.
- Gzipped, published as a tagged release `backup-daily-YYYY-MM-DD`.
- Rotation: 30 daily / 12 weekly / 12 monthly via [`scripts/backup/rotate.sh`](../scripts/backup/rotate.sh).

### Manual on demand (UI)
- Options page → **Sauvegarde manuelle** → button.
- Endpoint `POST /api/backup/manual` dumps 8 tables to JSON gzip, uploads to Supabase `manual-backups` bucket.
- Listed below with Download (signed URL, 1h expiry) + Delete actions.
- Never auto-rotated.

### Catalog snapshots
- `npm run snapshot-catalog` writes the `tcg_catalog` table to `backups/`.
- `npm run restore-catalog` restores from a snapshot.
- Used before re-scraping.

---

## PWA installation

### Manifest + icons
- [`app/manifest.ts`](../app/manifest.ts) declares the PWA: name, start_url, display: standalone, theme color, lang.
- Icons in [`public/icons/`](../public/icons/): `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`. Plus `app/apple-icon.png` (180px) and `app/icon.png` (favicon, 64px).

### Auto-show install banner
- [`<InstallPrompt />`](../components/layout/InstallPrompt.tsx) wired into the `(app)` layout.
- **Chrome / Edge / Android** — listens for `beforeinstallprompt`, shows banner with "Installer" button. Dismissed banner has 14-day TTL before re-showing.
- **iOS Safari** — shows banner with "Comment ?" button → opens illustrated 3-step modal (Share icon → Sur l'écran d'accueil → Ajouter).
- Auto-hides when running in standalone mode (already installed).

### Manual install (Options page)
- [`<PWAInstallSection />`](../components/options/PWAInstallSection.tsx) — always-visible card adapting to platform:
  - **Installed** — "✓ I.R.I.S est installée sur cet appareil"
  - **Chrome/Edge** — button "Installer l'application"
  - **iOS** — button "Voir les étapes" → instructions modal
  - **Unsupported** — message "Ton navigateur ne propose pas d'installation directe"

---

## Options

`/options` page (6th sidebar tab):

- **Apparence** — Theme toggle (light / dark, persisted in cookie).
- **Compte** — Email displayed + Sign out button.
- **Installation** — PWA install section (see above).
- **Sauvegarde manuelle** — list of past manual backups + new-backup button.
