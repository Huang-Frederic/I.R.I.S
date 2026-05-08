# Features

Here's everything I.R.I.S does, organized by module. The code map lives in [ARCHITECTURE.md](ARCHITECTURE.md).

## Table of contents

- [🔐 Authentication](#-authentication)
- [📷 Scanner & enrichment](#-scanner--enrichment)
- [🎴 Pokédex](#-pokédex)
- [📦 Stock](#-stock)
- [🛒 Vinted](#-vinted)
- [🧺 Lots (bundles)](#-lots-bundles)
- [💰 Pricing](#-pricing)
- [📊 Dashboard](#-dashboard)
- [👥 Multi-user collaboration](#-multi-user-collaboration)
- [🔄 Backups](#-backups)
- [📱 PWA installation](#-pwa-installation)
- [⚙️ Options](#%EF%B8%8F-options)

---

## 🔐 Authentication

There's no public sign-up. I.R.I.S is built for two.

Two accounts are seeded at install time, each with a `display_name` (set in `user_profiles`) and a CSS color token (`--color-user-lui` / `--color-user-elle`) that propagates across badges, action labels, and listing chips. When you're logged in, you always see yourself in the default green — the partner gets the identity color. Helps mental tracking when reviewing a list where both of you are selling.

Session persistence is handled by Supabase-managed cookies with automatic refresh.

---

## 📷 Scanner & enrichment

You point your phone at a card. Three seconds later, I.R.I.S knows what it is.

### Capture
- **Mobile** — native file picker (camera + gallery selection).
- **Desktop** — file input with drag-and-drop hint.
- **2-column layout** (desktop) — image preview on the left with a 1.5× magnifier loupe; form on the right.
- **Live image post-processing** — strip EXIF metadata, downscale to 1600 px max edge, JPEG quality optimized for OCR.

### OCR pipeline

The OCR runs on **Gemini 3.1 Flash Lite Preview** as primary engine. A single API call returns structured JSON with 14 fields — `card_name`, `pokemon_name`, `set_code`, `set_number`, `set_total`, `language`, `rarity`, `confidence`, `pokemon_number`, `pokemon_name_fr`, `set_name`, `set_name_fr`, `illustrator`, and `card_name_fr` (for Trainer/Energy cards).

When Gemini times out, errors, or returns unparseable output, **Google Cloud Vision** takes over automatically.

An `_engine` field is propagated to the UI — `Gemini`, `Gemini→Vision`, or `Vision` — alongside token usage and EUR cost displayed under the snippet. Image rotation is handled client-side before upload to avoid OCR confusion.

### Enrichment (6-strategy waterfall)

Knowing the name isn't enough. You need the full metadata — rarity, Pokémon number, price index — and the catalog reference that makes pricing possible.

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

## 🎴 Pokédex

Exactly one card per Pokémon, all 1 025 species.

Three view modes — large grid, compact grid, list — with a toggle persisted in localStorage via `useSyncExternalStore`. Search works by Pokémon number (exact) or French/English name (substring).

Click a filled slot and a drawer opens with full card details (image, set, pricing, notes). Click an empty slot and the drawer shows a "Scan a card" button that launches the inline scanner, locked to that Pokémon number.

When you scan a card whose Pokémon already has a slot, a modal proposes to keep the new one (old card moves to Stock or Vinted) or cancel. The scanner hard-blocks saves into a Pokédex slot if `pokemon_number` doesn't match — a bandeau explains why.

---

## 📦 Stock

Your physical inventory, mirrored.

Duplicate copies are grouped (same `card_id_tcg + language + condition + variant`). Each row shows a count chip `× N` that's editable inline — increase to clone the card, decrease to delete the most-recent collection copies.

A Pokédex tag shows whether each card already fills its Pokédex slot. Click "Pas Pokédex" and you get a confirm flow — if the Pokédex slot is occupied, a sub-flow handles the swap. The move-to-Pokédex modal is the same component used in Vinted.

Cards are sorted by date added ASC (oldest first).

---

## 🛒 Vinted

The for-sale pile. Cards with `status = 'for_sale'`.

Small listing badges on each row show "Listed by Me", "Listed by [partner name]", "Take down", and "Refresh stamp", all with identity colors. State filters are mutually exclusive chips — `Tout` (everything), `Mes annonces hors-ligne` (for_sale but not yet listed by me), `Mes annonces en ligne` (for_sale + listed by me, < 28 days), `À rafraîchir` (listed > 28 days, Vinted's bump threshold), `Vendues` (status = 'sold'). Type filter toggles between `Tout` / `Cartes` / `Lots`.

Search works across card_name, pokemon_name, set_name (cards) plus name, extra_description, language (lots).

### Annonce modal

Generates the Vinted listing copy ready to paste. Smart-truncated title (≤ 80 chars), templated description with shipping block, copy-to-clipboard button, downloadable card image (PNG, EXIF stripped, anti-bot watermark processed). On mobile, a picture-in-picture image preview lets you verify the card while drafting.

### Sold modal

Records the sold price, optional partial price split if mid-bulk, captures `sold_by_user_id`.

When you mark a `for_sale` card as sold and a `collection` copy of the same card exists, a restock toast prompts to relist it. A promote-after-sold modal chains after restock, letting you bulk-promote remaining cards. If restock has nothing to promote AND the partner has an active listing, a partner cleanup modal suggests they take down their listing.

### Bulk vendu

Toggle "Sélection multiple", checkbox per row, bottom bar shows total. The bulk modal walks you through per-card price split. A recap modal carousel chains into the restock flow.

### Additional controls

A `📦 × N` stock count chip displays if `collection` copies exist — click to clone or trim. The "Retire listing" X button opens a modal: move to Stock or delete entirely (with cascade warning if the partner is listing too). Click a card image and a full-screen modal opens with chevron navigation.

---

## 🧺 Lots (bundles)

A lot is a Vinted listing that bundles multiple cards behind one or more photos.

Quick form with 5 fields — name, price, language, condition, optional description — plus a multi-photo dropzone. A live annonce preview lets you see the generated Vinted text before saving. A carousel modal provides chevron navigation, dot indicators, and arrow key support for browsing photos.

Lots follow the same lifecycle as cards — for_sale to sold, with the same price refresh badges and listing badges. No OCR, no Pokédex, no pricing cron. Lots are manual entries.

---

## 💰 Pricing

You don't price your cards. I.R.I.S does.

### Sources

Cardmarket's official API closed to new applicants in 2023, so the pricing pipeline is bespoke.

**Cardmarket dumps (primary)** — a daily S3 mirror (~67K products + 72K pricing rows) lands in Postgres. No external API call at lookup time. **TCGdex live API (fallback)** takes over when the dumps don't have a match. **Manual price** is the last resort for cards where neither source applies (variants without CM equivalent, exotic JP promos).

### Lookup pipeline

Four steps, in order:

1. **Set name to expansion ID** — fuzzy-matched against `cardmarket_expansions` (HTML decode + token-sort + TCGdex bridge for FR localized names).
2. **(Expansion ID, set_number) to idProduct** — exact lookup via `cardmarket_card_index` (the **fast path**, populated by a per-expansion Playwright gallery scrape).
3. **Fallback when index missing** — name-prefix matching on `cardmarket_products` with rarity-aware disambiguation.
4. **Pricing fetch** — `cardmarket_pricing` row by `id_product`. Reverse-holo variants use `*_holo` columns where available.

### Display

Four prices per card — Low, Trend, Avg30, "Annonce" (your suggested selling price, never auto-updated). A freshness badge uses 4-tier color coding (fresh < 7 days, stale 7–30, old > 30, never). The refresh button triggers a manual per-card refresh (single-card endpoint, auth via Supabase session).

Every priced card carries a "View on Cardmarket ↗" deep link below the price block on the Pokédex drawer and Annonce modal. The match is verifiable.

### Cron

A **daily Vercel cron** at `0 2 * * *` UTC pulls the 200 oldest `for_sale` cards (`cm_updated_at ASC NULLS FIRST`), refreshes them via the lookup pipeline, parallelism 10. Auth via `CRON_SECRET`.

A **daily GitHub Action** at `0 1 * * *` UTC refreshes the Cardmarket S3 dumps into Supabase.

### Cost (current model)

~€0.0004 per OCR scan (Gemini 3.1 Flash Lite). Zero per pricing refresh (local lookup). Zero per backup (within Supabase + GitHub free tier).

---

## 📊 Dashboard

At the end of the day, you want the whole picture. The Dashboard answers in one screen.

A period selector (7 d / 30 d / 90 d / 1 y) drives **4 KPI tiles** — stock value (sum of `cm_price_avg` for all `for_sale` + `collection` cards), OCR cost (sum of `cost_eur` from `ocr_usage_log` over the period), scans (count of OCR calls over the period), and cards added (count of cards created over the period).

Below: pokédex progress with the latest captures, a rarity drill-down donut (clicks open `/pokedex?rarity=X`), a daily-cost stacked bar (Gemini + Vision via Recharts), a custom-SVG 24-week scan heatmap (GitHub-style intensity), the top 10 rares (sorted by `cm_price_avg`, deep-linked to drawer), and the last 10 sales.

---

## 👥 Multi-user collaboration

Your partner has her own Vinted account. The collection is shared. The listings are not.

### Tables

Under the hood, `cards` and `lots` are shared inventory rows — both users can read. `card_listings` and `lot_listings` are per-user listing state, RLS-scoped writes (you can only insert/delete your own listings). `sold_by_user_id` captures who marked the sale.

### Visual identity

Each user has a CSS token (`--color-user-lui` blue, `--color-user-elle` pink) that propagates across listing badges, sold-by labels, and action buttons (when partner-affecting). "Me" always renders in default green — no risk of mistaking your own actions for the partner's.

### Cross-user flows

When you mark a partner's listing as sold, the cleanup modal fires: "Le partenaire a aussi une annonce en ligne, lui demander de la retirer ?" The "À rafraîchir" chip plus confirm modal sends POST `/api/listings` to upsert `listed_at = NOW()` — an instant Vinted "bump". `<RouteChangeRefresher>` triggers a server data refresh whenever you navigate between tabs.

### Trainer card support

`pokemon_number` and `pokemon_name` are nullable (Trainers and Energies have no Pokémon). The Pokédex grid hides slots where `pokemon_number` is null. The scanner shows "Carte non-Pokémon — pas de slot Pokédex" for non-Pokémon cards. Gemini extracts `card_name_fr` for Trainers (e.g. "Le Plan de N" for "Nの筋書き").

---

## 🔄 Backups

Your data shouldn't disappear. It doesn't.

### Daily automatic (GitHub Actions)

Every night, `pg_dump --data-only` runs on 8 user-data tables. The result is gzipped and published as a tagged release `backup-daily-YYYY-MM-DD`. Rotation keeps 30 daily, 12 weekly, 12 monthly via [`scripts/backup/rotate.sh`](../scripts/backup/rotate.sh).

### Manual on demand (UI)

Options page, **Sauvegarde manuelle** button. Endpoint `POST /api/backup/manual` dumps 8 tables to JSON gzip, uploads to Supabase `manual-backups` bucket. Listed below with Download (signed URL, 1h expiry) and Delete actions. Never auto-rotated.

### Catalog snapshots

`npm run snapshot-catalog` writes the `tcg_catalog` table to `backups/`. `npm run restore-catalog` restores from a snapshot. Used before re-scraping.

---

## 📱 PWA installation

I.R.I.S lives on your home screen like a native app.

### Manifest + icons

[`app/manifest.ts`](../app/manifest.ts) declares the PWA — name, start_url, display: standalone, theme color, lang. Icons in [`public/icons/`](../public/icons/) include `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, plus `app/apple-icon.png` (180px) and `app/icon.png` (favicon, 64px).

### Auto-show install banner

[`<InstallPrompt />`](../components/layout/InstallPrompt.tsx) is wired into the `(app)` layout.

**Chrome / Edge / Android** — listens for `beforeinstallprompt`, shows a banner with "Installer" button. Dismissed banner has 14-day TTL before re-showing.

**iOS Safari** — shows a banner with "Comment ?" button that opens an illustrated 3-step modal (Share icon, Sur l'écran d'accueil, Ajouter).

Auto-hides when running in standalone mode (already installed).

### Manual install (Options page)

[`<PWAInstallSection />`](../components/options/PWAInstallSection.tsx) is an always-visible card that adapts to platform:

- **Installed** — "✓ I.R.I.S est installée sur cet appareil"
- **Chrome/Edge** — button "Installer l'application"
- **iOS** — button "Voir les étapes" opens instructions modal
- **Unsupported** — message "Ton navigateur ne propose pas d'installation directe"

---

## ⚙️ Options

The `/options` page (6th sidebar tab) holds everything you configure once and forget.

**Apparence** — theme toggle (light / dark, persisted in cookie). **Compte** — email displayed plus Sign out button. **Installation** — PWA install section (see above). **Sauvegarde manuelle** — list of past manual backups plus new-backup button.
