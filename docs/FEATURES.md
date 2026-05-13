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
- [📈 Price history & `/prices` page](#-price-history--prices-page)
- [📊 Dashboard](#-dashboard)
- [👥 Multi-user collaboration](#-multi-user-collaboration)
- [🔄 Backups](#-backups)
- [🌍 Internationalization](#-internationalization)
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
- **Live image post-processing** — strip EXIF metadata, downscale to 1400 px max edge, JPEG quality optimized for OCR.

### OCR pipeline

The OCR runs on **Gemini 3.1 Flash Lite Preview** as primary engine. A single API call returns structured JSON with 11 fields — `card_name`, `pokemon_name` (in card's printed language), `set_prefix` (3–4 letter code printed bottom-left), `set_number` (digits only — null for TG/GG subseries), `set_total`, `language`, `rarity`, `confidence`, `pokemon_number` (national dex), `illustrator`, and `card_name_fr` (full French translation for Trainer/Energy cards).

When Gemini times out, errors, or returns unparseable output, **Google Cloud Vision** takes over automatically.

An `_engine` field is propagated to the UI — `Gemini`, `Gemini→Vision`, or `Vision` — alongside token usage and EUR cost displayed under the snippet. Image rotation is handled client-side before upload to avoid OCR confusion.

### Pokémon name resolution (static dex map)

Gemini's translations of Pokémon species names hallucinate routinely (it returned `"Mew"` for dex=5 Charmeleon, `"Abo"` for dex=3 Venusaur). To make translations deterministic, the OCR route overrides Gemini's `pokemon_name_fr` and `pokemon_name_en` with values from a static map at [`lib/data/pokemon-names.json`](../lib/data/pokemon-names.json) — 1 025 species × FR/EN/JA, generated once from PokéAPI via [`scripts/generate-pokemon-names.ts`](../scripts/generate-pokemon-names.ts). Lookup is O(1), zero network. Re-run the generator when a new Pokémon generation ships.

### Enrichment (4-strategy pipeline)

Knowing the name isn't enough. You need the cardmarket reference that makes pricing possible, plus rarity and national-dex metadata.

For every scan, [`/api/enrich`](../app/api/enrich/route.ts) tries strategies in order until one matches. Each entry/exit is logged with `[enrich]` prefix for debugging:

0. **Cardmarket by `(set_prefix + set_number)`** — direct lookup. Resolves `set_prefix` (e.g. "BRS") to `id_expansion` via `cardmarket_expansions`, then fetches the unique `(id_expansion, set_number)` row from `cardmarket_card_index`. If 1 hit → returned. If multiple hits (reverse holo / variants) → exposed as picker. **Self-validation**: if matched product's `card_name` doesn't contain the OCR `pokemon_name_en`, the match is rejected and the pipeline falls through.
1. **Cardmarket picker by `(set_prefix + pokemon_name)`** — fires when set_number is null (Gemini saw a TG/GG subseries marker), or when Strategy 0 returned 0 / was rejected. Uses `pokemon_name_en` (from static dex map, derived via reverse-lookup if user typed FR/JP manually) + suffix from `card_name` (ex/V/VMAX) to query `cardmarket_products.card_prefix`. Returns up to 10 candidates, picker UI surfaces them.
2. **TCGdex live** — for cards not in the local cardmarket dump (very old sets, exotic locales). HTTP round-trip. Pokémon name translations are still derived from the static map (TCGdex's editorial `dexId` is wrong on themed sets like SV2A "Pokémon Card 151").
3. **Gemini-only fallback** — last resort. No `cardmarket_id`, no price, no image, but populates `set_name` from `set_prefix` lookup + carries OCR fields through. User can still record the card.

### Card images

Cardmarket S3 images return 403 to direct hotlinks (CloudFront flags non-browser referers). All image URLs go through [`/api/cm-img/[id]?prefix=<set_prefix>`](../app/api/cm-img/%5Bid%5D/route.ts) which fetches with a browser-like Referer/User-Agent header and caches at the edge for 7 days.

### Bilingual name display

For cards with divergent OCR vs canonical names, display helpers in `lib/utils/format-name.ts` compose bilingual labels:
- `displayPokemonName(card)` — returns `"Dracaufeu"` if `pokemon_name_ocr` matches canonical, or `"Dracaufeu (Charizard)"` if OCR differs
- `displayCardName(card)` — same logic for Trainer/Energy cards
- `displaySetName(card)` — returns the canonical English set name from `set_name`

The raw OCR values (`pokemon_name_ocr`, `card_name_ocr`) are preserved in separate columns for debugging and future localization. Set names remain in canonical English throughout the app — `set_name_ja` schema column is kept for potential future use but not currently displayed.

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

A compact Cardmarket price chip on every row shows `cm_price_avg` plus a freshness badge (`<1j` / `Maj il y a Xj` / `Jamais maj`). Click the chip to open the matched Cardmarket product page in a new tab — handy to verify the print before listing.

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
2. **(Expansion ID, set_number) to idProduct** — exact lookup via `cardmarket_card_index`. The index is populated by BrightData scrape (~33K rows across 741 expansions, ~$3 cost, 99.3% success rate). The BrightData scraper at `scrapers/cardmarket/` parses each expansion's gallery page to extract real `(id_product, set_number, url_variant, url_path)` tuples. The historical SQL formula (see [CARDMARKET_MAPPING.md](CARDMARKET_MAPPING.md)) was found unreliable in practice and is now kept as a fallback for rapid prototyping only.
3. **Fallback when index missing** — name-prefix matching on `cardmarket_products` with rarity-aware disambiguation.
4. **Pricing fetch** — `cardmarket_pricing` row by `id_product`. Reverse-holo variants use `*_holo` columns where available.

### Display

Four prices per card — Low, Trend, Avg30, "Annonce" (your suggested selling price, never auto-updated). A freshness badge uses 4-tier color coding: `<1j` (fresh, < 24h), `Maj il y a Xj` (stale 1–7 days, then old > 7), `Jamais maj` (never refreshed). Stock rows display a compact one-chip variant — just `cm_price_avg + badge`, clickable through to Cardmarket. The refresh button triggers a manual per-card refresh (single-card endpoint, auth via Supabase session).

Every priced card carries a "View on Cardmarket ↗" deep link below the price block on the Pokédex drawer and Annonce modal. The match is verifiable.

### Cron + manual refresh-all

The **Vercel pricing-refresh cron** runs **3×/day** at `0 8,14,20 * * *` UTC, pulling cards across `for_sale + pokedex + collection` (`cm_updated_at ASC NULLS FIRST`) and refreshing via the lookup pipeline, parallelism 10. Auth via `CRON_SECRET`. Sold cards are excluded — they have a final `sold_price`. The endpoint accepts a `?limit=` query param (default 200) so cron runs and the front-end loop together guarantee a full catalogue pass within a single day.

A **manual "Refresh all prices" button** on the Options page lets a logged-in user force-refresh every eligible card without waiting for the cron. The endpoint accepts both `CRON_SECRET` and Supabase session auth and supports a `?since=ISO` query param to filter cards stale relative to the click time. The button loops the endpoint client-side, capped at 50 iterations × 200 cards = 10 000 max, with live progress (`Traité X · Mis à jour Y · Skipped Z`).

Skipped or terminal-failed cards (variant kept-manual, missing identifiers, expansion not on CM, no_pricing_yet, etc.) get their `cm_updated_at` touched too, so they don't perma-block the cron's `nullsFirst+oldest-first` queue and the refresh-all loop terminates cleanly.

A **nightly Vercel snapshot cron** at `55 23 * * *` UTC calls `POST /api/prices/snapshot` (CRON_SECRET) which runs the SQL RPC `insert_daily_price_snapshot` — one row per priced card into `price_history`. See the [Price history](#-price-history--prices-page) section below.

A **daily GitHub Action** at `7 1 * * *` (01:07 UTC) refreshes the Cardmarket S3 dumps into Supabase.

### Cost (current model)

~€0.0004 per OCR scan (Gemini 3.1 Flash Lite). Zero per pricing refresh (local lookup). Zero per backup (within Supabase + GitHub free tier).

---

## 📈 Price history & `/prices` page

A single price snapshot tells you what a card is worth today. It doesn't tell you whether it's been climbing for a month or just bounced back from a dip. So I.R.I.S keeps a rolling history.

### Storage model

The `price_history` table holds one row per `(card_id, snapshot_date)` with `cm_price_low / cm_price_trend / cm_price_avg` — same triplet the live `cards` row carries. Migration: `20260513100000_price_history.sql`.

To keep the table bounded as the catalogue grows, **`downsample_price_history`** (SQL function) collapses anything older than 90 days into weekly buckets and anything older than a year into monthly buckets. Triggered weekly by `pg_cron` (Sunday 04:00 UTC).

### Daily snapshot

A Vercel cron at `55 23 * * *` UTC calls `POST /api/prices/snapshot` (CRON_SECRET). The handler invokes the SQL RPC **`insert_daily_price_snapshot`** which inserts one row per priced card (skipping cards with no `cm_updated_at`, and skipping cards already snapshotted same day). Idempotent — re-running is safe.

### Trend arrows on every chip — `<PriceWithTrend>`

The shared component **`<PriceWithTrend>`** is a drop-in replacement for the raw `cm_price_avg` cell. It renders the price plus a **cascade trend arrow**: it compares today's avg against J-1 first, then J-7, J-30, J-90 in turn, and surfaces the **first non-flat delta** (whichever horizon is the freshest meaningful signal). Color-coded `up` (green) / `down` (red) / `flat` (muted).

Used wherever a price is displayed: `<StockRow>`, `<VintedRow>`, `<PokedexCard>`, the Dashboard top-rares table, `<LotRow>`, and the `/prices` page list.

### `<PriceDetailModal>` and inline `<PriceHistoryChart>`

Click any price chip in Stock / Dashboard / Prices and the **`<PriceDetailModal>`** opens with:

- A Recharts line chart of `cm_price_avg` over the selected period (rendered by **`<PriceHistoryChart>`**).
- Stat block: low / trend / avg, latest snapshot date.
- **Delta matrix**: J-1, J-7, J-30, J-90 absolute and percent deltas.

Inside the **Pokédex drawer** and the **Vinted Annonce modal**, the same `<PriceHistoryChart>` is rendered **inline** (no nested modal) — better z-index hygiene, fewer taps to see the curve.

### `/prices` page

A new top-level nav entry between Vinted and Dashboard, dedicated to portfolio-wide price movement. Server-rendered shell with three blocks:

1. **Period selector** — 7 d / 30 d / 90 d / 1 y, drives every block on the page.
2. **Portfolio value chart** — single line tracking the sum of `cm_price_avg` across `for_sale + collection + pokedex` over the period.
3. **Top movers** — gainers and losers, switchable J-1 / J-7 / J-30 horizons. Backed by SQL RPC `price_history_top_movers`.
4. **Virtualized list** — every priced card with name, set, current avg, sparkline (mini `<PriceHistoryChart>`). Searchable by card name / set name / Pokémon name. Virtualized with `react-window` so 10K+ rows render smoothly.

Global stats (count of priced cards, period min/max/avg, etc.) come from the SQL RPC `price_history_global_stats`.

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

## 🌍 Internationalization

The UI ships in 4 languages: English (default), French, Japanese, Simplified Chinese. Translations live in `messages/{en,fr,ja,zh}.json` (628 keys nested by feature) and are loaded server-side via [next-intl](https://next-intl.dev). The active locale is stored in a `lang` cookie (1-year max-age) — first visit picks the best match from `Accept-Language`, the language toggle in Options overrides on click. URLs stay locale-agnostic (no `/en/...` prefix).

API error responses follow a code-based contract: `{ error: 'snake_case_code', message: 'EN fallback' }`. The client looks up `t(\`errors.\${code}\`)` with the server message as fallback — codes are stable across versions, translations evolve per-locale.

Cardmarket / TCGdex set names and Pokémon card OCR strings stay in their printed language by design (this is data, not UI). Date and number formatters keep `fr-FR` numeric formatting (`12/05/26`, `12,50 €`) since those are unambiguous enough across locales for a personal app — i18n covers UI labels, action buttons, modal text, and error messages.

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
