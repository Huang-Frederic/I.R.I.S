# Features

What I.R.I.S does today, page by page, in the order of the navigation. Every threshold, limit and default quoted here comes from the code; the files that hold it are linked at the end of each section. For how the code is organised see [ARCHITECTURE.md](ARCHITECTURE.md), for the database [SUPABASE.md](SUPABASE.md), for installation [SETUP.md](SETUP.md), for scripts and cron endpoints [COMMANDS.md](COMMANDS.md).

I.R.I.S ("Intelligent Recognition Inventory System") is a Next.js 16 and Supabase PWA that two collectors use to run one shared Pokémon TCG collection: scan cards, price them from Cardmarket, sell them on Vinted (with a Python posting bot in [`vinted-agent/`](../vinted-agent/README.md)), follow price movements, and analyse one player's Pokémon TCG Live games. It has 17 pages, 35 API routes and 33 tables (71 migrations). The app is covered by 156 Vitest files (1,401 tests) and the bot by 153 pytest tests.

Last checked against the code: 2026-10-10.

**Conventions**

- The interface is used in French. UI labels appear in « guillemets », with an English gloss in parentheses where it helps, for example « À rafraîchir » (stale).
- Paths are relative to the repository root. Page files live at `app/(app)/<route>/page.tsx`; they are written as plain code rather than links because the parentheses break Markdown link targets.
- The *owner* is the account that can see Items and runs the bot; the *partner* is the other account. In the database their display names are « Lui » and « Elle » (see [The two-user model](#the-two-user-model)).

## Contents

- [Vocabulary](#vocabulary)
- [Dashboard](#dashboard)
- [Prix](#prix)
- [Pokédex](#pokédex)
- [Stamps](#stamps)
- [Scanner](#scanner)
- [Vinted](#vinted)
- [Bot Vinted](#bot-vinted)
- [Stock](#stock)
- [Journal](#journal)
- [Tournois](#tournois)
- [Stats](#stats)
- [Drill](#drill)
- [Événements](#événements)
- [Activité](#activité)
- [Options](#options)
- [Login](#login)
- [Mobile navigation](#mobile-navigation)
- [PWA installation](#pwa-installation)
- [Languages](#languages)
- [The two-user model](#the-two-user-model)
- [Scheduled jobs](#scheduled-jobs)

The navigation has 15 entries, in this order: Dashboard, Prix, Pokédex, Stamps, Scanner, Vinted, Bot Vinted, Stock, Journal, Tournois, Stats, Drill, Événements, Activité, Options ([components/layout/nav-items.ts](../components/layout/nav-items.ts)).

## Vocabulary

A few words recur on every page.

| Term | Meaning | Where it is enforced |
|---|---|---|
| Pokédex (`pokedex`) | The single card kept for a species, one per national dex number (1 to 1025). | Partial unique index `one_pokedex_per_pokemon`. Trainers and Energies have no dex number and can never be Pokédex cards. |
| Vinted (`for_sale`) | The sale pile. | Partial unique index `one_for_sale_per_group`: at most one `for_sale` card per *group*. |
| Stock (`collection`) | Cards owned but not for sale, including every extra copy of a card that is already for sale. | Copies 2..N of a scan always land here. |
| Vendu (`sold`) | A card sold for a price and date. | `sold_by_user_id` records who sold it. |
| Échangé (`traded`) | A card that left through an exchange made outside Vinted. | `traded_at`, `traded_by_user_id`, optional photo. |
| Group | `card_id_tcg` + language + condition + variant. Rows on Vinted and Stock are grouped by it. | [lib/utils/group-cards.ts](../lib/utils/group-cards.ts) |
| Variant | Standard, Poké Ball, Master Ball, Reverse Holo, Stamp, Promo. | [components/submit/CardScanForm.constants.ts](../components/submit/CardScanForm.constants.ts) |
| Condition | NM, EX, GD, PL, PO. | Same file. |
| Language | JP, EN, FR, KO, CN in every dropdown. The database and API also accept DE, IT, ES, PT, but the UI hides them. | `UI_LANGUAGES` in [lib/types/index.ts](../lib/types/index.ts) |
| Rarity | SAR, AR, SR, CHR, RR, R Holo, R, UC, C, « Autre ». | Same file. |
| Low, Trend, Avg | The three Cardmarket price-guide figures stored on each card. Avg is the one shown on chips, in the dashboard and in portfolio value. | [lib/utils/stock-value.ts](../lib/utils/stock-value.ts) falls back to Trend, then Low, when Avg is missing. |
| « Annonce » | The price you ask on Vinted (`suggested_price`). At scan time it is Trend × 0.85 when a Trend is known; after that only you change it. | `PRICE_COEFFICIENT` in [lib/constants/pricing.ts](../lib/constants/pricing.ts) |
| Lot | A Vinted bundle or single card listed from photos, without scanning. Any brand. | [Scanner](#scanner), tab « Autre & Lot » |
| Items (« Objets ») | Non-card products (clothes, electronics). Owner only. | [Items](#items), under Vinted |

## Dashboard

Route `/dashboard` (page file `app/(app)/dashboard/page.tsx`). It is the first navigation entry, the PWA start page, and the target of `/`, which only redirects here.

**What it shows**

- **Period tabs** « 7j · 30j · 90j · 1 an » set `?period=7d|30d|90d|365d`. The default is `7d`, and any unknown value falls back to `7d`. The period drives the OCR-cost tile, the two sales tiles and the cost chart. The refresh icon re-runs the server queries; otherwise the page is cached for 60 s (`revalidate = 60`).
- **Day detail** (top card). The arrows walk back day by day, up to 168 days (24 weeks), and show for that day the OCR calls with their engine split (« 3G · 1V » for Gemini and Vision), the cards added, the OCR cost in euros and the tokens in thousands.
- **Four tiles**
  - « Stock + Vinted »: value of the cards in the Vinted and Stock piles. The Pokédex is excluded here because it has its own tile. Each card counts at Avg, else Trend, else Low, else 0.
  - « Coût OCR {période} »: sum of `ocr_usage_log.cost_eur` over the period.
  - « Ventes {période} — {seller} », one tile per seller: sum of `sold_price` by `sold_by_user_id` for cards and lots sold during the period. Items and exchanges are not counted. The two seller names are hard-coded in the page.
- **Pokédex tile**: `n / 1025`, the percentage, a progress bar, the Cardmarket value of the Pokédex cards and the three latest additions. It links to `/pokedex`.
- **Rarity donut** (« Répartition rareté »): switch between « Compte » (number of cards) and « Valeur » (euros). Clicking a slice opens `/pokedex?rarity=X`. It covers Pokédex, Vinted and Stock cards.
- **Cost chart** (« Coût OCR (7 jours) »): daily cost for the period, stacked by engine (Gemini, Vision).
- **Scan heatmap** (« Activité scans (N semaines) »): OCR calls per day over 24 weeks, with three intensity levels relative to the busiest day shown. On narrow screens it keeps as many weeks as fit, never fewer than 4. Hovering a day shows the same four figures as the day detail.
- **Dernières ventes**: the 10 most recent sales (cards and lots merged by sale date) with seller and price. The header shows the all-time total and the total per seller.
- **Top 10 cartes rares**: the ten most valuable cards across Pokédex, Vinted and Stock, ranked by price (not by rarity). The price chip opens the price detail (see [Prix](#prix)). The row opens `/pokedex?pokemon_number=N` unless the card is a Trainer or Energy.
- **Postées sur Vinted aujourd'hui**: the cards the bot posted today for the signed-in account (UTC date), each with a « Voir ↗ » link to the live ad. Lots and Items are not listed here.

**Rules worth knowing**

- Days are bucketed in UTC. A scan made just after midnight Paris time can land on the previous day.
- Every unbounded query goes through `fetchAllRows`, which pages in blocks of 1000 because Supabase clamps any response to 1000 rows ([lib/api/fetch-all.ts](../lib/api/fetch-all.ts)).
- Several widget strings (« Dernières ventes », « Postées sur Vinted aujourd'hui », the sales tile labels) are French literals in the components and do not follow the language switch.

**Main files:** `app/(app)/dashboard/page.tsx` · [lib/utils/dashboard-queries.ts](../lib/utils/dashboard-queries.ts) · [lib/utils/stock-value.ts](../lib/utils/stock-value.ts) · [components/dashboard/DashboardKpiStrip.tsx](../components/dashboard/DashboardKpiStrip.tsx) · [components/dashboard/ScanHeatmap.tsx](../components/dashboard/ScanHeatmap.tsx) · [components/dashboard/DayDetailKpi.tsx](../components/dashboard/DayDetailKpi.tsx) · [components/dashboard/RarityDonut.tsx](../components/dashboard/RarityDonut.tsx)

## Prix

Route `/prices` (page file `app/(app)/prices/page.tsx`), nav label « Prix ». It follows how the value of the collection moves. It is a client page that reads Supabase directly, in four blocks. Each block has its own period buttons.

**What it shows**

1. **« Aperçu »** (7j · 30j · 90j, default 7j): how many priced cards went « en hausse » (up), « en baisse » (down) or are « stables », plus the mean volatility « Volatilité 7j ». When the chosen period has no history yet, it falls back to a shorter one and shows the period actually used, for example « (7j) ».
2. **« Valeur du portefeuille »** (30j · 90j · 1 an · tout, default 90j): an area chart of the total value, with checkboxes « Vinted », « Stock » and « Pokédex » (the Pokédex is unchecked by default). The header shows the current total and the change since the start of the window. The series comes from `stock_value_snapshots`, one row per day. Cards that have no history yet are back-filled at their first known price, so adding a card does not draw a false jump.
3. **« Top mouvements »** (7j · 30j · 90j, default 7j): « Top hausses » and « Top baisses », ten cards each. A card qualifies only when its current Avg is at least 1.00 € and a daily price exists on or before the base date. If the window has no mover, it falls back to a shorter one. Clicking a card opens the price detail.
4. **« Toutes les cartes »**: every priced card in Vinted, Stock and Pokédex. A search box (name, set number, set name), a sort (« Tri: Δ » by default, price, name, set) and a status filter (« Tous statuts », « Vinted », « Stock », « Pokédex »). Each row shows a sparkline of the last 30 daily points, the change (over 30 days when a point exists around J-30, otherwise 7 days, otherwise 1 day, with the period shown when it is not 30 days) and the current Avg. Identical prints are collapsed into one row (the most expensive copy is kept). The list is virtualised: rows are 44 px high and the viewport is at most 600 px. `/prices?set=<code>` pre-filters on a set and shows a removable chip « Set: CODE ✕ ».

**Price chips and arrows.** Wherever a price is shown (Stock rows, Pokédex drawer, Annonce modal, dashboard top 10, this page) it carries a trend arrow. The rule ([lib/utils/price-trend.ts](../lib/utils/price-trend.ts)):

- The arrow compares today's Avg with the price J-1, J-3, J-7, J-30 and J-90 in that order, and shows the first tier whose change is at least 0.5 %. A tier accepts a stored point within ±2 days of its nominal date.
- If no tier has a point or every change is below 0.5 %, there is no arrow.
- The arrow is green up or red down with the absolute percentage, and the tooltip reads « {pct}% sur {n}j ({base} → {current}) ».
- The 90 days of history for every visible card are fetched in one batched request (50 ms debounce) by `PriceTrendsProvider`, never one request per row.

**Price detail** (click any chip). A dialog with your photo (« Ma photo ») and the reference image (« Image TCG ») side by side, Low / Trend / Avg with the freshness badge and a « Maj » refresh button, a history chart (7j · 30j · 90j · 1an · tout, default 30j), Min / Max / Médiane / Volatilité, the change matrix « Δ 7j · Δ 30j · Δ 90j · Δ 1an » (each cell is independent), a « Lien Cardmarket » link and « Voir tous les mouvements » (opens `/prices?set=<code>`). When today's snapshot is built on a price older than 2 days, it adds « Snapshot basé sur un prix vieux de {n}j ». The same chart is embedded in the Pokédex drawer and the Annonce modal.

**Freshness badge** ([lib/utils/format-staleness.ts](../lib/utils/format-staleness.ts)): « <1j » under 24 h, « Maj il y a Nj » from 1 to 7 days, the same text in a stronger tone after 7 days, « Jamais maj » when the card was never priced.

**Cardmarket links.** « voir sur Cardmarket ↗ » opens the product page that fed the prices. For a French card the link carries `?language=2`, so the offers are filtered to French ([lib/utils/cardmarket-url.ts](../lib/utils/cardmarket-url.ts)).

### Where the prices come from

Cardmarket's own API is closed to new applicants, so I.R.I.S mirrors Cardmarket's public price-guide and product dumps into Postgres and looks cards up locally. TCGdex's live API is the fallback. Nothing is fetched from Cardmarket at lookup time.

**Lookup order** ([lib/api/cardmarket-pricing.ts](../lib/api/cardmarket-pricing.ts)):

1. If the card already has a `cardmarket_id` (set at scan time or corrected by hand), that product is used as is. This stops promo prints from flipping between versions at each refresh.
2. Otherwise the set name is matched to a Cardmarket expansion: HTML-decoded, « Pokémon » prefix removed, alternative spellings taken from `tcg_catalog` and a TCGdex bridge for FR, DE, IT, ES and PT names, then an exact match on the normalised name and finally a token-sorted fuzzy match.
3. The index `cardmarket_card_index` maps (expansion, set number) to one or a few products.
4. If the index has nothing, the product is found by name prefix in `cardmarket_products`.
5. The `cardmarket_pricing` row gives Low, Trend and Avg. If several products share the number, a heuristic takes the highest Avg for SAR, AR and SR cards and the lowest for the rest, and flags the result as ambiguous.
6. If Cardmarket has no price, TCGdex is queried (5 s timeout).

**Cards that are never repriced.** Any variant other than Promo (Poké Ball, Master Ball, Reverse Holo, Stamp) keeps its manual prices, as do cards without set identifiers. A single-card refresh on such a card answers HTTP 422 with `variant_kept_manual` or `missing_identifiers`. Every outcome that yields no price still updates `cm_updated_at`, so the card goes to the back of the queue instead of blocking it.

**Refresh paths** ([app/api/prices/update/route.ts](../app/api/prices/update/route.ts))

- **Scheduled**: Vercel calls `/api/prices/update?limit=700` at 08:00, 14:00 and 20:00 UTC with `Authorization: Bearer $CRON_SECRET`. Each run takes the cards with the oldest price first (never priced first) among Vinted, Stock and Pokédex cards (sold and traded cards are final), ten at a time. `limit` is clamped to 1..1000 and defaults to 200. Each run ends by upserting the day's `stock_value_snapshots` row.
- **One card**: the refresh button (« Maj ») in the price detail, the Pokédex drawer and the Annonce modal calls `POST /api/prices/update?card_id=<uuid>` with the session cookie.
- **Everything**: « Rafraîchir tous les prix » in [Options](#options).

**History.** `price_history` stores one row per card and day. At 23:55 UTC `/api/prices/snapshot` calls the SQL function `insert_daily_price_snapshot()`, which upserts one row per card in Vinted, Stock or Pokédex that has an Avg, with the age in days of that price. A weekly `pg_cron` job (Sundays 04:00 UTC) folds daily rows older than 90 days into weekly medians and weekly rows older than 365 days into monthly medians. The RPCs `price_history_top_movers` and `price_history_global_stats` feed the page: a card with no baseline counts as « stable », and a change under 0.01 € does too.

**Main files:** `app/(app)/prices/page.tsx` · [components/prices/StatsHeader.tsx](../components/prices/StatsHeader.tsx) · [components/prices/PortfolioValueChart.tsx](../components/prices/PortfolioValueChart.tsx) · [components/prices/TopMoversPanel.tsx](../components/prices/TopMoversPanel.tsx) · [components/prices/AllCardsList.tsx](../components/prices/AllCardsList.tsx) · [components/price/PriceDetailModal.tsx](../components/price/PriceDetailModal.tsx) · [components/ui/PriceWithTrend.tsx](../components/ui/PriceWithTrend.tsx) · [components/ui/PriceTrendsProvider.tsx](../components/ui/PriceTrendsProvider.tsx) · [lib/utils/price-trend.ts](../lib/utils/price-trend.ts) · [lib/api/price-history.ts](../lib/api/price-history.ts) · [app/api/prices/snapshot/route.ts](../app/api/prices/snapshot/route.ts) · [vercel.json](../vercel.json)

## Pokédex

Route `/pokedex` (page file `app/(app)/pokedex/page.tsx`). One slot per species, 1025 in all, and exactly one card per slot. The subtitle reads « 312 / 1025 enregistrés (30%) · 1 234,00 € ».

**What you do**

- **Browse.** Each slot shows the species sprite from PokeAPI: in colour when a card fills it, as a red silhouette when it is empty. Three view modes, remembered in `localStorage` (`iris.pokedex.viewMode`): « Grille compacte » (default), « Grille large » and « Liste ».
- **Filter.** Generation (nine, Gen 1 Kanto to Gen 9 Paldea), status (« Tous », « Complétés », « Manquants »), rarity (the ten tiers plus « Toutes raretés ») and a search box « N° ou nom ». A number matches exactly (`12` finds #12, not #125); a name matches the French name, the English name or the stored card's name, ignoring accents. A counter reads « N affichés · 1025 dans le filtre ».
- **Deep links.** `?pokemon_number=N` scrolls to the slot and opens its drawer; `?rarity=X` pre-filters. The dashboard donut and top 10 use them.
- **Open a slot.** A bottom sheet on mobile, a 440 px side drawer on desktop.
  - *Filled slot*: your photo (« Ta photo ») next to the official image (« Image TCG »), name, set, number, rarity and variant, language, condition, date added; Low / Trend / Avg with arrow, « Annonce », freshness badge, refresh button and Cardmarket link; the price history chart; « Remplacer (N disponibles) » and « Retirer cette carte ».
  - *Empty slot*: « Aucune carte enregistrée pour ce Pokémon. » and « Scanner une carte », which opens the scanner inside a modal, locked to this species and to the Pokédex destination (see [Scanner](#scanner)).

**Rules worth knowing**

- **Replace.** « Remplacer » lists the Stock and Vinted copies of the same Pokémon. After choosing one, a dialog asks where the card leaving the slot goes: « Vers Stock » or « Vers Vinted ». The swap is the SQL function `replace_pokedex_card`, done in three steps so the two unique indexes never collide. If another identical copy is already for sale, moving the old card to Vinted fails with `for_sale_conflict`, and Stock is the way out.
- **Remove.** « Retirer cette carte » offers « Déplacer vers Stock », « Déplacer vers Vinted » (refused if an identical copy is already for sale) or « Supprimer définitivement ». The slot is freed.
- **Wrong species.** When a scan is locked to a slot and the detected national number differs, the save is blocked with « Cette carte n'est pas {nom} (#n). Le numéro détecté est #m… » ([lib/utils/pokedex-mismatch.ts](../lib/utils/pokedex-mismatch.ts)).
- **From other pages.** The green « Pokédex » badge on Vinted and Stock rows opens a side-by-side comparison with the card in the slot. The red « Pas Pokédex » badge opens « Ajouter au Pokédex ? »; if the slot is taken, a second step asks where the current occupant goes.
- **Restock alert.** When the last Vinted and Stock copy of a species is sold or traded while its Pokédex slot is filled, a toast « Plus de stock pour {nom} » appears with « Vérifier le Pokédex » ([lib/utils/restock-detection.ts](../lib/utils/restock-detection.ts)).

**Main files:** `app/(app)/pokedex/page.tsx` · [components/pokedex/PokedexGrid.tsx](../components/pokedex/PokedexGrid.tsx) · [components/pokedex/PokedexFilters.tsx](../components/pokedex/PokedexFilters.tsx) · [components/pokedex/PokedexDrawer.tsx](../components/pokedex/PokedexDrawer.tsx) · [components/pokedex/drawer/CardDetails.tsx](../components/pokedex/drawer/CardDetails.tsx) · [components/pokedex/drawer/ReplaceFlow.tsx](../components/pokedex/drawer/ReplaceFlow.tsx) · [components/cards/MoveToPokedexModal.tsx](../components/cards/MoveToPokedexModal.tsx) · [app/api/pokedex/replace/route.ts](../app/api/pokedex/replace/route.ts) · [lib/utils/pokemon-generations.ts](../lib/utils/pokemon-generations.ts)

## Stamps

Route `/stamps` (page file `app/(app)/stamps/page.tsx`). A read-only gallery of every card whose variant is Stamp, whatever its status (Vinted, Stock, Pokédex, sold). The subtitle reads « Le showroom de tes cartes Stamp — N ».

- A binder-style grid, three columns on a phone up to eight on a wide screen. Hovering a card shows its name, rarity and language; clicking it opens a full-size view.
- A search box (« Recherche : nom, set… » over card name, Pokémon name and set name) and two dropdowns, « Toutes langues » and « Toutes raretés ».
- Sorted by set name, then card name. The grid renders 50 cards at a time; « Charger plus (N) » adds 50.
- Stamp cards are created from the scanner with the variant dropdown or with « Stamp Mode ». They are never repriced automatically (see [Prix](#prix)).

**Main files:** `app/(app)/stamps/page.tsx` · [components/stamps/StampsShowroom.tsx](../components/stamps/StampsShowroom.tsx)

## Scanner

Route `/submit` (page file `app/(app)/submit/page.tsx`), nav label « Scanner ». Three tabs add things to the collection: « Scanner » (cards from photos, the default), « Autre & Lot » (bundles and single cards listed by hand) and « Objets » (non-card products, visible to the owner only).

### Tab « Scanner »

Photograph a card and I.R.I.S reads it, finds it in the Cardmarket data and pre-fills the form. You review and save one card at a time.

**1. Pick photos**

- « Capturer en chaîne » opens an in-page camera (rear camera, 1920×2560 ideal, JPEG 0.92). Each tap of the shutter adds a thumbnail, « Done (N) » validates, and it stops at the photo limit. It reports unsupported browsers, refused permission and missing cameras in separate messages.
- Or drop files on the dashed zone / click it (« Drop ou clic pour ajouter (max 30) »).
- At most 30 photos per batch (`MAX_PHOTOS`). Non-image files are ignored, the rest are sorted by file name, and thumbnails can be removed.
- The checkbox « Stamp Mode » (« défaut : variante Stamp + Stock ») pre-selects the Stamp variant and the Stock destination for every card in the batch and skips the Pokédex suggestion. It stays editable per card.

**2. Analyse.** « Analyser N photo(s) » processes the photos five at a time (`CONCURRENCY = 5`, to stay under Gemini's request-rate limit) with a progress line « Analyse en cours… i/N ». For each photo:

- The browser first shrinks it to 1400 px on the long side and re-encodes it as JPEG at quality 0.85, keeping the original EXIF (dimensions updated, orientation reset to 1). 1400 px was chosen after tests: 1024 lost the set code on 8 of 30 cards and 1600 cost more image tokens ([lib/utils/resize-image.ts](../lib/utils/resize-image.ts)). The server accepts request bodies up to 25 MB.
- `POST /api/ocr` extracts the card; `POST /api/enrich` identifies it. If either call fails, the photo keeps an empty slot you can fill by hand.

**3. Review.** The batch then walks through the photos with « Carte i / N (nom du fichier) ». « Enregistrer » saves and moves to the next card; « Annuler » skips the photo. At the end, « Récap du batch » reads « N carte(s) enregistrée(s) · M ignorée(s) · K échec(s) », with « Voir le résultat » (opens `/vinted`) and « Nouveau batch ».

**How the OCR works** ([lib/api/gemini-vision.ts](../lib/api/gemini-vision.ts), [app/api/ocr/route.ts](../app/api/ocr/route.ts))

- The primary engine is Gemini (`gemini-3.1-flash-lite-preview`). One call returns structured JSON with 13 fields: `card_name`, `pokemon_name`, `pokemon_number`, `pokemon_name_fr`, `pokemon_name_en`, `card_name_fr`, `set_prefix`, `set_number`, `set_total`, `language`, `rarity`, `illustrator` and `confidence`. Only `card_name`, `language` and `confidence` are required, because an illegible set code must come back as null rather than guessed. Temperature 0, reasoning disabled, 300 output tokens, 15 s timeout.
- If Gemini times out, errors, returns something unparseable or an incomplete payload, Google Cloud Vision text detection takes over and set code and number are pulled out of the text by pattern. The result carries the engine that answered.
- Pokémon names are never taken from Gemini. The route overwrites the French and English names from a static table of 1025 species (FR, EN, JA) keyed by the national dex number ([lib/data/pokemon-names.json](../lib/data/pokemon-names.json)), because the model's translations were wrong often enough to matter.
- Gemini's confidence maps to 0.95 (high), 0.75 (medium) or 0.5 (low). The form shows « OCR fiable » with the percentage from 0.8 up, « OCR à vérifier » below.
- The panel shows the engine (« [Gemini] », « [Gemini→Vision] » when Gemini billed tokens but its answer was unusable, « [Vision] » when Gemini was unavailable), the token counts and the cost in euros. Gemini is priced at $2.00 per million input tokens and $5.00 per million output tokens, converted at 0.92; a Vision call counts $1.50 per thousand. Every call is written to `ocr_usage_log` with its user, which feeds the [Dashboard](#dashboard).

**How a card is identified** ([app/api/enrich/route.ts](../app/api/enrich/route.ts)). Four strategies run in order and the first hit wins:

1. **Cardmarket by set code and number.** The code (for example « BRS ») is matched to an expansion, then `cardmarket_card_index` gives the product for that number. One hit is the match. Several hits (reverse-holo and other print siblings) open a picker. If the matched product's name does not contain the Pokémon the OCR saw, the match is rejected and the next strategy runs, which catches a misread set code.
2. **Cardmarket by set code and name.** Used when the number was a Trainer Gallery or subset marker (`TG`, `GG`, `SV`, `SVE`, `RC` prefixes), when strategy 1 found nothing, or when it was rejected. It searches the English name plus the printed suffix (ex, V, VMAX, VSTAR, GX, BREAK, LEGEND) and returns up to 10 candidates in a picker.
3. **TCGdex live**, for cards missing from the local Cardmarket data (very old sets, exotic locales). It also resolves printed codes TCGdex does not index, such as « 30C » for the 30th Celebration, from the Pokémon alone.
4. **OCR fields only.** No Cardmarket id, no price, no image, but the set name is looked up from the set code so the form is not empty.

A scan matched through Cardmarket comes back without prices; a card matched through TCGdex can arrive with them. A card with no price is the first one the next scheduled refresh picks up (see [Prix](#prix)). The Cardmarket image is served through `/api/cm-img/[id]?prefix=<code>`, a proxy that sends browser-like headers because Cardmarket's CDN answers 403 to hotlinks, and caches the result for 7 days.

**The review form** ([components/submit/CardScanForm.tsx](../components/submit/CardScanForm.tsx))

- Fields: « Nom de la carte » (required), « Nom du Pokémon », « Set », « N° », « Langue », « N° Nat. », « Rareté », « État », « Nom du set (optionnel) », « Variante », « Notes (optionnel) ». For a card that is not French, names read like « Carapuce (ゼニガメ) »: the French name followed by the printed one.
- The preview has a 1.5× magnifier loupe; once it scrolls out of view on mobile, a sticky strip keeps the matched card, the species sprite and your photo on screen.
- « Re-rechercher dans le catalogue » re-runs the identification from the values you typed. Leave the number empty for Trainer Gallery cards.
- **Destination** (« Status »): « Vinted », « Pokédex » or « Stock ». « Pokédex » disappears when there is no national number. The default comes from the suggestion below, and the select is outlined blue for Vinted, amber for Stock and red for Pokédex.
- **Quantité**: one scan can create N copies, up to 50 (`MAX_COUNT` in the API). The first copy goes to the chosen destination; copies 2..N go to Stock, because Vinted and the Pokédex allow only one per group ([lib/utils/build-batch-rows.ts](../lib/utils/build-batch-rows.ts)). The row is inserted in one request together with a single photo upload.

**Suggestion banner.** After identification, `POST /api/pokedex/suggest` compares the card with the one in its Pokédex slot ([lib/utils/pokedex-suggestion.ts](../lib/utils/pokedex-suggestion.ts)):

| Case | Message | Suggested destination |
|---|---|---|
| No national number (Trainer, Energy, Stadium) | « Carte non-Pokémon… — pas de slot Pokédex » | Vinted |
| Empty slot | « Aucune carte pour {nom} dans ton Pokédex » | Pokédex |
| Higher `rarity_rank` than the slot's card | « …plus rare que celle dans ton classeur… » | Pokédex |
| Same rank and Trend above 1.1× the slot's card | « Même rareté…, mais prix Cardmarket plus élevé… » | Pokédex |
| Otherwise | « Tu as déjà un {rareté} {langue} de {nom} dans ton classeur » | Vinted |

**Conflicts on save.** Before inserting, the server runs three checks and answers 409 with the existing card, and the form opens a dialog:

- `exact_duplicate` (a card with the same id, language, condition and variant already exists): « Cette carte possède déjà une illustration » asks « Quelle photo veux-tu garder ? » between « Nouveau scan » and « Photo actuelle ». The photo is shared by every copy of the same card, so the choice is applied to all of them ([lib/utils/sibling-photos.ts](../lib/utils/sibling-photos.ts)).
- `pokedex_slot_taken`: « Voulez-vous remplacer ? » shows the old and new card side by side and asks whether the old one goes « Vers Stock » or « Vers Vinted ».
- `for_sale_conflict`: « Carte déjà en vente sur Vinted » offers « Ajouter à mon Stock » (all N copies).

**Slot scan.** The same form opens inside the Pokédex drawer for an empty slot, locked to that species and to the Pokédex destination. Saving is blocked when the detected number does not match (see [Pokédex](#pokédex)).

**Main files:** `app/(app)/submit/page.tsx` · [components/submit/SubmitTabs.tsx](../components/submit/SubmitTabs.tsx) · [components/submit/BatchForm.tsx](../components/submit/BatchForm.tsx) · [components/submit/PhotoDropzone.tsx](../components/submit/PhotoDropzone.tsx) · [components/submit/CameraCaptureOverlay.tsx](../components/submit/CameraCaptureOverlay.tsx) · [components/submit/CardScanForm.tsx](../components/submit/CardScanForm.tsx) · [app/api/ocr/route.ts](../app/api/ocr/route.ts) · [app/api/enrich/route.ts](../app/api/enrich/route.ts) · [app/api/cards/batch/route.ts](../app/api/cards/batch/route.ts) · [lib/api/cardmarket-enrich.ts](../lib/api/cardmarket-enrich.ts) · [lib/api/tcgdex.ts](../lib/api/tcgdex.ts) · `app/api/cm-img/[id]/route.ts`

### Tab « Autre & Lot »

For things the scanner cannot read: bundles, sealed product, another trading card game, or a single card you would rather list by hand. A live preview on the right shows the exact Vinted title and description.

- **Type**: « Carte unique » (Vinted catalog 4875) or « Lot de cartes » (catalog 4879).
- **Marque**: One Piece, Magic, Pokémon (default), Lorcana, Riftbound or « Autre ». The brand goes into the title and groups the lot in the bot queue.
- **Titre Vinted (n/80 car.)**: you type the middle part only; the final title is composed as « Lot de Cartes {marque} {nom} [FR] » (« Carte… » for a single). If that is over 80 characters it drops the brand, then truncates the name but always keeps the language tag. Tabs are collapsed, and all-caps words of four letters or more are lower-cased after the first letter (VMAX becomes Vmax) because Vinted refuses titles with too many capitals ([lib/utils/vinted-title.ts](../lib/utils/vinted-title.ts), [lib/utils/lot-template.ts](../lib/utils/lot-template.ts)).
- **Prix (€)** is optional at creation. A lot without a price is created but is never queued or posted.
- **Destination**: « Vinted » or « Stock ». **Quantité**: identical copies, up to 99 in the form.
- **Langue**: JP, EN, FR, KO or CN. **Condition**: the five levels spelled out in French, from « Très bon état (Near Mint) » to « Mauvais état (Poor) ». **Description (optionnel)** is inserted between the condition line and the shipping block.
- At least one photo is required; photos are shrunk like scanner photos and stored in the `lot-photos` bucket as `<lot id>/<n>.jpg`. « Créer l'article » posts to `/api/lots`.
- A lot created for sale with a price joins the queue of every Vinted-enabled account straight away (see [Bot Vinted](#bot-vinted)).
- The description repeats « ❌ PAS D'ENVOI VINTED GO ❌ » at the top and the bottom, then the language line, the condition, the optional text and the shipping lines ([lib/utils/vinted-template.ts](../lib/utils/vinted-template.ts)).

**Main files:** [components/submit/OtherForm.tsx](../components/submit/OtherForm.tsx) · [app/api/lots/route.ts](../app/api/lots/route.ts) · [lib/utils/lot-template.ts](../lib/utils/lot-template.ts) · [lib/vinted/lot-queue-sync.ts](../lib/vinted/lot-queue-sync.ts)

### Tab « Objets » (owner only)

Creates an Item: a non-card product sold on Vinted. The tab does not exist for the partner account. What Items are, how they are gated and how they are posted is described under [Items](#items) in the Vinted section; this is the creation form ([components/other-items/OtherItemForm.tsx](../components/other-items/OtherItemForm.tsx)).

- **Photos**: the same drop zone as the scanner, at most 20 (Vinted's own limit). Photos are shrunk in the background and the submit button waits for any resize still in progress.
- **Titre** (required, 80 characters; longer is flagged « Le titre dépasse 80 caractères »).
- **Catégorie Vinted** (required): a type-ahead over Vinted's full category tree, 2,920 categories stored as static data, accent-insensitive, showing at most 30 matches; arrow keys and Enter work, Escape closes ([components/other-items/CategoryPicker.tsx](../components/other-items/CategoryPicker.tsx)).
- **Description (optionnel)**, **Prix (€)**, **Marque (optionnel)** (free text).
- **État**, **Taille** and **Couleur (2 max)** depend on the category (see [Items](#items)). Choosing a category triggers a request to the bot for that category's options.
- **Destination**: « Vinted » or « Stock ». « Créer l'article » posts to `/api/other-items`.
- Submitting is blocked when the category asks for a size or a colour that is missing, but only once the category's options are known. While the bot has not answered, the item can still be created and the size set later in its fiche.

## Vinted

Route `/vinted` (page file `app/(app)/vinted/page.tsx`), nav label « Vinted ». The sale pile: cards in the Vinted status, lots and, for the owner, Items. Subtitle: « N cartes — tri FIFO ». Each account sees its own listing state next to the other's (see [The two-user model](#the-two-user-model)).

### The list

- One row per *group* of cards. Cards are never duplicated in this list: the unique index allows one `for_sale` card per group and extra copies are counted by the Stock chip « × N ».
- Rows show the photo (click to zoom), name, variant, set, language, rarity and condition, the Pokédex badge, the stock chip, the listing badges, an inline price (« Annonce ») and the buttons.
- The default order puts what needs action first, in three buckets. *Offline* rows (no listing of yours), oldest added first; then *stale* rows, most overdue first; then *fresh* rows, most recently posted first. The sort toggle « Ancien en premier » / « Récent en premier » reverses the order inside each bucket ([lib/utils/vinted-interleave.ts](../lib/utils/vinted-interleave.ts)). Cards, lots and Items are interleaved by this rule.
- The page draws 60 rows and « Charger plus (N) » adds 60 more. The server loads every `for_sale` row, but only the 40 most recent sold cards, the 40 most recent traded cards and the 20 most recent sold lots.
- It listens for Supabase Realtime changes on your `card_listings` rows and refreshes itself (2 s debounce). This keeps it in step when the bot posts or when a promotion moves a listing.

### Filters

- Search over set number, card name, Pokémon name, set name, set code, language and rarity (« Recherche : nom, set, n°… »; Items by name, description and brand). Selects for language, rarity and variant. On mobile the selects hide behind « Filtres ».
- **Type**: « Tout », « Cartes », « Singles », « Lots » and, for the owner, « Items ». With a lot type selected, a brand select appears (Pokémon, One Piece, Magic, Lorcana, Riftbound, « Autres »). A non-Pokémon brand hides cards.
- **State chips**, combinable (a union; none selected means everything):
  - « En ligne » (fresh): you have a listing, posted 21 days ago or less.
  - « Pas en ligne »: you have no listing.
  - « À rafraîchir » (stale): posted more than 21 days ago.
  - « Vendus » and « Échangés » add the sold and traded piles.
- **Who listed it**, an independent axis combined with the state chips: « Tous », « Par moi », « Par {partenaire} », « Cross-listées » (both of you), « Non listées » (neither) and « À retirer » (you have a listing but the item is no longer for sale).
- A counter shows « N sur M ».

### Listing state and badges

Three different things are easy to confuse:

- **A flag in I.R.I.S.** « Mettre en ligne » marks the card as online in the app only (its dialog reminds you to publish on vinted.com). The green « Listée par Moi · Nj » badge takes it back offline after confirmation. The red « À rafraîchir · Nj » badge resets the date to now (`listed_at` and `vinted_posted_at`) after confirmation, which is a bookkeeping reset without any action on Vinted. The badge « Listée par {partenaire} » is tinted with the partner's colour, and « À retirer » means your listing outlived the item.
- **The bot posting for you.** The green « Vinted » button on an offline row queues a post job for the agent. It needs a Vinted-enabled account (listed in `VINTED_USER_IDS`) and a price; without one the row reads « Prix manquant ». The button then shows « En attente… » and « ✓ En ligne ! » with a « Voir » link when the job is done.
- **A bump.** In the ⋯ menu of an online row, « Gérer l'annonce Vinted » opens a dialog with « Mis en ligne : aujourd'hui / il y a N jours », the price, « Voir l'annonce » and « Bump ». After a confirmation (« Remettre l'annonce en tête de liste ? ») it queues a *repost* job: the bot deletes the ad and publishes it again. The row shows « Bump en cours… » until the job ends (polled every 3 s).

**Stale** means `vinted_posted_at` is more than 21 days old ([lib/utils/listing-stale.ts](../lib/utils/listing-stale.ts), `STALE_DAYS = 21`). A listing with no Vinted id is never stale, because there is nothing to bump. A listing row with no Vinted id still counts as online.

### The « Annonce » dialog

Gives you everything needed to post by hand, and previews what the bot would post.

- Your photo and the reference image (picture-in-picture with a swap on mobile). « Download img » saves a copy prepared for upload: a light random crop (2 to 4 % per edge), JPEG 0.95, the original EXIF kept and a camera-style file name ([lib/utils/image-postprocess.ts](../lib/utils/image-postprocess.ts)).
- The title, built to 80 characters or fewer with a six-step ladder: full bilingual name with variant and set, then without the bilingual part, without the « Carte Pokémon » prefix, set name replaced by its code, set dropped, variant dropped, and as a last resort a hard cut that keeps the card name and language tag. Japanese and Chinese characters are removed and all-caps words of four letters or more are lowered. A counter turns red above 80.
- The description, with « ❌ PAS D'ENVOI VINTED GO ❌ » at the top and the bottom, the language line, the condition, your notes and the shipping lines. Both fields are editable, with copy buttons (« Copier le titre », « Copier la description »).
- The price grid Low / Trend / Avg (with arrow) / « Annonce », the freshness badge, a refresh button, the Cardmarket link and the price history chart. Clicking « Annonce » edits it inline (Enter saves, Escape cancels).
- « Supprimer cette annonce » opens « Retirer ton annonce » with two choices: « Re-ranger en stock » (you keep the card, it leaves Vinted) and « Supprimer la carte » (you no longer have it). If the partner still has a live listing, the dialog warns about it; moving to Stock then only removes your own listing and leaves the card for sale for the partner.

Setting the « Annonce » price by hand (inline in the row or in this dialog) is what *confirms* it: the server stamps `price_confirmed_at`. The price filled in at scan time is only a suggestion, and only a confirmed price lets a card into the bot queue ([lib/vinted/queue-eligibility.ts](../lib/vinted/queue-eligibility.ts)).

### Selling

- **Marquer comme vendue.** « Vendu » sits in the ⋯ menu of an online card row, and always in a lot row. It asks for the sale price (optional) and date (default today), and records who sold it. An offline card row has no per-row « Vendu »; sell it through the multi-select.
- **What follows a card sale** (`PATCH app/api/cards/[id]/route.ts`):
  1. If the species' Pokédex slot is filled and no Vinted or Stock copy remains, the **restock toast** appears.
  2. If a Stock copy of the same group exists, « Mettre l'exemplaire Stock en vente ? » proposes the oldest one (« Garder en Stock » or « Mettre en vente »). Accepting makes it the new for-sale card. The partner's live ad moves to it, your own (now dead) ad is dropped, and the old price (with its confirmation) is copied if the new card has none.
  3. If the partner had a live ad and nothing replaces the card, « Action requise pour {nom} » says the ad has to come down. The server also queues a `delete` job for the bot on the other account's ad. `delete` jobs do not count against the daily quota ([lib/vinted/cross-user-sync.ts](../lib/vinted/cross-user-sync.ts)).
  4. The card leaves the Vinted queue of both accounts.
- **Sélection multiple.** The toggle in the filter bar adds checkboxes and a bottom bar: « Annuler », « Push / Bump (N) », « Échanger (N) » (cards only) and « Vendre la sélection (N) ». Lots can be sold or pushed in bulk but not exchanged. Items cannot be selected.
- **Vente groupée.** One total price, split equally in cents with the remainder on the last item (100 € over 3 gives 33.33, 33.33, 33.34; [lib/utils/split-bulk-price.ts](../lib/utils/split-bulk-price.ts)). A recap carousel lists the items (« N items vendus ») and the restock alerts; the Stock copies that can replace the sold cards open together in « Mettre des cartes en vente »; then one partner notice lists the affected items.
- **Push / Bump (N).** For every selected card or lot: an offline one is queued for publishing, an online one for a repost. A recap reads « {n} publiée(s), {m} repostée(s) » and counts failures.

### Exchanges

An exchange made outside Vinted. « Échanger (N) » opens « Échange groupé » with a date and an optional photo of the exchange (uploaded once to the `card-photos` bucket under `trades/` and stamped on every card of the batch). Each card becomes `traded`.

- If a Stock copy exists, it silently takes the listing over: the live ads stay up and only the Stock count drops. The recap says « N annonce(s) reprise(s) par un exemplaire du stock — rien à retirer sur Vinted ».
- Otherwise your listing is dropped and the partner notice applies.
- The restock check runs as for a sale. The « Échangés » pile shows each card with an « Échange » badge, the date, who recorded it and a « Photo » link.
- Exchanges can also be recorded from [Stock](#stock).

### Lots

- A lot row shows the name, a « Single » or « Lot » badge, the brand, language, condition, the photo count, a quantity chip « × N », an inline price, « Annonce », the « Vinted » button and a ⋯ menu with « Vendu » and, for an online lot, « Gérer l'annonce Vinted ».
- The lot dialog has a photo carousel (arrows, dots, ← and → keys), « Download img (anti-bot) », the generated title and description, the editable price, « Mettre en stock » (the lot leaves Vinted; the dialog reminds you to unpublish on vinted.com) and « Supprimer ce lot » (photos, lot and all listings).
- **Quantity.** Selling one copy of a lot with a quantity above 1 splits it: a sold clone with quantity 1 keeps the sale history, and the original is decremented and stays for sale. Your ad was the one bought, so it is dropped and the lot is queued again on your account; the partner's ad stays, since copies remain. A lot that sells out queues a `delete` job for the other account's ad.
- Lots parked in Stock appear in the « Lots en stock (N) » section of [Stock](#stock).

### Items

Items are the third sellable thing next to cards and lots: clothes, accessories, a robot vacuum, anything on Vinted that is not a trading card. They were added in October 2026 and are strictly for the owner's account.

**Gating.** The rule is that the partner must not be able to tell the feature exists, not just that she cannot read its rows. It is enforced at every layer, and the owner's user id is a constant (`FRED_USER_ID` in [lib/vinted/other-item-queue-sync.ts](../lib/vinted/other-item-queue-sync.ts)), not an environment variable.

- *Interface*: the « Objets » tab, the « Items » filter and the rows are not rendered for other accounts, and the page does not even query the tables.
- *API*: `/api/other-items` (create), `/api/other-items/[id]` (edit, delete) and a post job with an `other_item_id` answer 403 `forbidden` to any other account.
- *Database*: row-level security on `other_items`, `other_item_listings`, `vinted_catalog_attributes` and the `other-item-photos` bucket is tied to the owner's id. Two restrictive policies hide the rows of `vinted_queue` and `vinted_post_jobs` that carry an `other_item_id`, so the partner cannot see Items in the bot monitoring either.
- *One exception*: the activity log (see [Activité](#activité)) is readable by both accounts and also records Item actions (`other_item.created`, `other_item.updated`, `other_item.deleted`, and the bot's `listing.posted` for an Item), so it is the one surface where the partner could notice that Items exist.

**In the list.** Items appear under « Tout » and « Items ». A row has a thumbnail, the name, a brand badge, an « En ligne » / « Pas en ligne » label, an inline price and a « Fiche » button. The label is informational only.

**The fiche** (« Fiche article ») is the Items counterpart of the Annonce dialog, with no Cardmarket section because Items have no market price. It has the photo carousel, the title (80 characters) and description exactly as the bot will post them, copy buttons, « Download img (anti-bot) », the editable price, an « Attributs Vinted » block (condition, size, colours, with « Enregistrer »), « Mettre en stock » and « Supprimer cet article » (photos and queue entry included). Saving the attributes clears any failure flag on the queue entry. The text mirrors the bot's builders line by line ([lib/utils/other-item-template.ts](../lib/utils/other-item-template.ts) and `build_other_item_description` in [`vinted-agent/main.py`](../vinted-agent/README.md)): « ✨ nom », « 📘 Marque : … », « 📏 Taille : … », « ✅ État : … », your text, then the shipping lines. It has no « PAS D'ENVOI VINTED GO » banner, because Items are not sent through Vinted Go.

**Attributes.** Vinted asks different things per category. The values are Vinted's own ids, stored as is:

- *Condition*: 6 « Neuf avec étiquette », 1 « Neuf sans étiquette », 2 « Très bon état » (the default), 3 « Bon état », 4 « Satisfaisant ». A category can add or restrict (7 « Certaines pièces ne fonctionnent pas » on appliances, perfume accepts only 6). The form shows only what the category accepts and corrects a stale value on the spot.
- *Size*: offered only when the category has sizes, grouped as Vinted groups them. The option id is stored for the bot and its label for the description.
- *Colour*: up to 2 of Vinted's 29 colours, offered when the category asks for one.
- *Parcel format*: not editable in the app. The bot uses the item's own value if one is set in the database, then « Petit » where the category offers it, then Vinted's own suggestion.

**The attributes cache.** Vinted serves a category's options only through a logged-in session, which only the bot holds. So the form inserts a `pending` row into `vinted_catalog_attributes` and the bot, which polls every 5 s, fills it in; the bot also refreshes a category's row each time it posts in it. The form polls every 2 s, says « En attente du bot… » after 15 s and stops after 180 s. [components/other-items/hooks/useCatalogAttributes.ts](../components/other-items/hooks/useCatalogAttributes.ts) holds the polling.

**Size ids are not stable.** Vinted renumbers a category's sizes from time to time. The bot and the fiche keep a stored id while it is still offered, otherwise they find the stored label again (exact match, or a bare number such as « 45 » against « EU 45 ») and save the new id. Only an unmatched label is flagged ([lib/vinted/other-item-attributes.ts](../lib/vinted/other-item-attributes.ts)).

**Queue.** An Item is queued when it is for sale with a price above 0 and not already online, with no confirmation step. [lib/vinted/other-item-queue-sync.ts](../lib/vinted/other-item-queue-sync.ts) runs after every create and edit. A database trigger (`other_items_status_update_queue_sync`) does the same when the status is edited directly in the Supabase table editor, so the two are deliberately redundant. In the bot grid Items form their own group, « other-items ».

**Not available for Items:** a manual online/offline toggle, a « sold » flow and sold pile, multi-select and bulk actions. An Item moved to « Stock » leaves the Vinted view and there is no Stock list for Items yet.

**Main files:** `app/(app)/vinted/page.tsx` · [components/vinted/VintedList.tsx](../components/vinted/VintedList.tsx) · [components/vinted/VintedRow.tsx](../components/vinted/VintedRow.tsx) · [components/vinted/VintedFilters.tsx](../components/vinted/VintedFilters.tsx) · [components/vinted/ListingBadges.tsx](../components/vinted/ListingBadges.tsx) · [components/vinted/AnnonceModal.tsx](../components/vinted/AnnonceModal.tsx) · [components/vinted/SoldModal.tsx](../components/vinted/SoldModal.tsx) · [components/vinted/BulkSoldModal.tsx](../components/vinted/BulkSoldModal.tsx) · [components/vinted/BulkTradeModal.tsx](../components/vinted/BulkTradeModal.tsx) · [components/vinted/PromoteAfterSoldModal.tsx](../components/vinted/PromoteAfterSoldModal.tsx) · [components/vinted/VintedActionModal.tsx](../components/vinted/VintedActionModal.tsx) · [components/vinted/OtherItemAnnonceModal.tsx](../components/vinted/OtherItemAnnonceModal.tsx) · [components/lots/LotRow.tsx](../components/lots/LotRow.tsx) · [components/lots/LotAnnonceModal.tsx](../components/lots/LotAnnonceModal.tsx) · [lib/utils/vinted-filter.ts](../lib/utils/vinted-filter.ts) · [lib/utils/vinted-template.ts](../lib/utils/vinted-template.ts) · [lib/utils/promote-detection.ts](../lib/utils/promote-detection.ts) · `app/api/cards/[id]/route.ts` · `app/api/lots/[id]/route.ts` · [app/api/listings/route.ts](../app/api/listings/route.ts) · [app/api/vinted/post-job/route.ts](../app/api/vinted/post-job/route.ts) · [app/api/vinted/bump-job/route.ts](../app/api/vinted/bump-job/route.ts)

## Bot Vinted

Route `/vinted/bot` (page file `app/(app)/vinted/bot/page.tsx`), nav label « Bot Vinted ». It is the control surface for the autonomous posting agent. An account that is not Vinted-enabled sees « Vinted n'est pas activé pour ce compte. ». The page is full width, unlike the others (maximum 1200 px).

### The agent

The agent is a separate Python service in [`vinted-agent/`](../vinted-agent/README.md), not part of the Next.js app. It runs on a machine of the owner's (Mac or Windows launcher scripts, or a VPS service) and talks to Vinted's web API with each account's saved session. I.R.I.S only writes rows (the queue, jobs, settings) and reads the agent's state back.

- **One instance only.** On start, the agent puts every `processing` job of its accounts back to `pending`; a second running copy would post the same item twice.
- **Jobs.** The agent subscribes to new rows in `vinted_post_jobs` and runs each one: `post`, `repost` or `delete`. Jobs run one at a time across accounts, with a random 45 to 90 s pause after each. A repost deletes the ad, waits 30 to 90 s and publishes it again.
- **Heartbeat.** The agent writes a heartbeat every 30 s. The app considers it online when the last heartbeat is under 90 s old, and checks every 30 s. The state shows in the sidebar (« Agent connecté » / « Agent déconnecté »), as a dot on the mobile Vinted tab and in the status bar of this page.
- **Scheduler.** Every 5 minutes, for each account, the agent decides whether to create a job:
  - It acts only inside a posting window of the current day type: « Semaine » (Monday to Friday) or « Week-end » (Saturday and Sunday). No window means no automatic posting.
  - It stops when the day's quota is reached. The quota counts the post and repost jobs the scheduler created since local midnight. Manual jobs and `delete` jobs are not counted.
  - New posts come first. A repost is chosen only when the queue is empty, never in the same tick as a post. The next new post is the lowest position of the highest-priority group that still has rows (see the group priority below).
  - A repost candidate is a for-sale listing posted `repost_after_days` ago or more. A manual `repost_position` wins, then the oldest posting date.
  - Firing is randomised: the chance in each tick is the poll interval divided by the time left in the window, so the quota spreads across the window instead of bursting at its start.
  - Without a saved configuration the defaults are a quota of 8 and a repost after 14 days; both must be above 0.
  See [`vinted-agent/scheduler.py`](../vinted-agent/scheduler.py) for the decision function, which has no I/O of its own.
- **What it posts.** A card: its own photo (else the reference image) with the title and description built like the [Annonce dialog](#vinted). A lot: all its photos. An Item: all its photos, with the category's size, colours and condition. Titles go through the same cleanup as in the app (spaces collapsed, all-caps words of four letters or more lowered); if Vinted still refuses a title for its capitals, the agent retries once with a stronger pass.
- **No price, no post.** The agent never invents a price: a card posts at its « Annonce » price, a lot or Item at its price. When it is missing the job fails with « À compléter dans la fiche : Prix manquant » and the queue entry is flagged (it used to post such items at 1 €).
- **Failures.** A failed job goes back to the front of the queue so the item is not lost. A *permanent* failure (Vinted rejected the listing's data, a required attribute or the photos are missing) flags the queue entry with the reason; the scheduler skips it until the item is edited or posted manually. A *transient* one (timeout, expired session) returns unflagged and is retried at the next slot.
- **Session.** The cookies live in `vinted_sessions`. Before each job the agent rewrites its local cookie file from that table, and after the job it writes any refreshed token back. An expired session fails the job with a message that points to the cookie form below.
- **Other work.** It fills `vinted_catalog_attributes` rows on request (see [Items](#items)) and mirrors its console into `vinted_agent_logs`.

### The page

- **Status bar**: « Bot en ligne » / « Bot hors ligne »; « Quota du jour : n / quota »; « Prochain post estimé » (« Aujourd'hui 11:00 » or « mar. 11:00 », « — » when no window is configured); and two colour-coded chips with your name and the partner's. Switching shows the other account's bot; everything is read-only except the cookie form.
- **Active job banner**: « Publication en cours », « Republication en cours » or « Suppression en cours » with the item and elapsed time, or « N job(s) en attente ». The banner follows the jobs table live (Supabase Realtime); the queue, schedule, settings and logs are re-read every 30 s.
- **« File de nouveaux posts » (the queue).** The items waiting for a first post, drawn as a snake: rows alternate direction and chevrons link the cards, starting from a « Le bot commence ici » slot. When the queue is empty the page says « File de nouveaux posts : vide — plus rien en attente. ».
  - *Who enters.* A card enters the queue of every Vinted-enabled account when it is for sale, its price was confirmed (see [Vinted](#vinted)) and that account has no live ad for it. A lot or an Item needs to be for sale with a price above 0. The queue leaves automatically when the item is sold, moved or posted. Queue entry is handled by [lib/vinted/queue-sync.ts](../lib/vinted/queue-sync.ts), [lib/vinted/lot-queue-sync.ts](../lib/vinted/lot-queue-sync.ts) and [lib/vinted/other-item-queue-sync.ts](../lib/vinted/other-item-queue-sync.ts).
  - *Groups.* Cards group by « Pokémon {langue} » (« Pokémon FR », « Pokémon JP »…). Lots group by brand: « Pokémon », « One Piece », « Magic », « Lorcana », « Yu-Gi-Oh! », « Digimon », « Dragon Ball », « Wankul », « Riftbound », otherwise « Autres ». Items form the group « other-items ». Each group is a dashed frame with its own colour and label ([lib/vinted/group-key.ts](../lib/vinted/group-key.ts)).
  - *Order.* Groups follow the saved priority list, then first appearance; items keep their position inside a group. Cards are numbered « #n » in the order the bot will post them, and those beyond the daily quota are dimmed. The bot follows the same order.
  - *Hover or tap a card* to reveal its name, price and three actions: « Mettre en premier dans le groupe », « Poster maintenant » (creates an immediate manual post job, outside the schedule and not counted in the quota; refused when there is no price) and « Voir l'annonce » (opens the Annonce dialog, the lot dialog or the Item fiche). The card the agent is processing right now is dimmed and locked.
  - *Flagged entries* (a permanent failure) show « ! » instead of a number, an amber border and the reason in the card. They do not use a quota slot. Editing the item or « Poster maintenant » hands them back.
  - *Reordering.* Drag and drop works with the mouse only; touch screens use « Mettre en premier dans le groupe ». A reorder is staged and marked with a green border until you press « Enregistrer », which writes `vinted_queue.position`. Closing the page or switching account with unsaved changes asks for confirmation (« Modifications non enregistrées — les abandonner ? »).
- **« Reposts éligibles »** (the repost pool, « actif » once the queue is empty, faded « en attente » while it is not). It appears only when at least one listing qualifies. It uses the same snake and frames with labels « Repost · {groupe} » and the action « Reposter maintenant ». Reordering writes `repost_position` on the listing row of the viewed account (no dedicated table), in the order shown. The agent honours that number first and then the oldest posting date; the group frames are display only for reposts. The agent clears `repost_position` once the repost succeeds.
- **Logs** (scroll icon): the last 200 log lines for the viewed account, coloured by level, with « Aujourd'hui » / « Hier » / date dividers.
- **Paramètres** (gear icon) opens four sections:
  - « Quota & repost »: « Quota / jour » and « Repost après (jours) », both at least 1.
  - « Ordre de priorité des groupes »: drag the group names into the order you want. Groups present in the queue but not yet in the list are appended; a group missing from the list sorts after the listed ones.
  - « Planning horaire »: for « Semaine » and « Week-end », any number of windows (« + créneau »), each with a start and end time. An end time not after the start is flagged and cannot be saved. Saving replaces the account's whole schedule.
  - « Cookies Vinted »: paste the JSON of the `cookies_*.json` file (it must be an object; the raw export of a cookie-editor extension, an array, is refused). It is stored in `vinted_sessions` for the viewed account. This is the one cross-account write: either Vinted-enabled account can refresh the other's session ([lib/vinted/monitoring-auth.ts](../lib/vinted/monitoring-auth.ts)).

Some strings on this page (status bar, settings, queue labels) are French literals in the components rather than translation keys.

**Main files:** `app/(app)/vinted/bot/page.tsx` · [components/vinted/monitoring/MonitoringSection.tsx](../components/vinted/monitoring/MonitoringSection.tsx) · [components/vinted/monitoring/GroupedQueueGrid.tsx](../components/vinted/monitoring/GroupedQueueGrid.tsx) · [components/vinted/monitoring/GroupedRepostGrid.tsx](../components/vinted/monitoring/GroupedRepostGrid.tsx) · [components/vinted/monitoring/SettingsModal.tsx](../components/vinted/monitoring/SettingsModal.tsx) · [components/vinted/monitoring/hooks/useMonitoringData.ts](../components/vinted/monitoring/hooks/useMonitoringData.ts) · [lib/vinted/snake-order.ts](../lib/vinted/snake-order.ts) · [lib/vinted/group-sort.ts](../lib/vinted/group-sort.ts) · [lib/vinted/next-window.ts](../lib/vinted/next-window.ts) · [lib/vinted/repost-eligibility.ts](../lib/vinted/repost-eligibility.ts) · [lib/hooks/useAgentStatus.ts](../lib/hooks/useAgentStatus.ts) · [app/api/vinted/sessions/route.ts](../app/api/vinted/sessions/route.ts) · [vinted-agent/main.py](../vinted-agent/main.py) · [vinted-agent/scheduler.py](../vinted-agent/scheduler.py)

## Stock

Route `/stock` (page file `app/(app)/stock/page.tsx`), nav label « Stock ». Cards you own that are not for sale, oldest first. The subtitle reads « N cartes en collection (pas en vente) ».

- **Rows** are groups of identical cards: photo (click to zoom), name, variant, set, language, rarity, condition, a Pokédex badge (the same compare and « Ajouter au Pokédex ? » flows as on Vinted), a « Vinted » / « Pas Vinted » badge telling whether a copy of the group is already for sale, the Avg price chip with trend arrow (it opens the price detail and is hidden while the card has no price), the count and « Mettre en vente ».
- **Count « × N ».** Type a number and press Enter or leave the field. Raising it clones the card (same photo and data, always created in Stock); lowering it deletes the *freshest* copies and keeps the original; 0 asks first with « Vider tout le stock de cette carte ? » and « Action irréversible ».
- **« Mettre en vente »** moves the oldest copy of the group to Vinted. It is disabled, with the tooltip « Un exemplaire est déjà en vente — impossible d'en lister deux », when the group already has a card for sale. If the page data was stale and the server still answers 409, « Échanger avec la carte en vente ? » appears: you pick where the card already on sale goes (« Vers Stock » or « Marquer vendue ») and the new one takes its place.
- **Filters**: search (name, set, number…), language, rarity, variant, and « Tous » / « En vente » / « Pas en vente » (whether the group has a copy for sale). The page draws 60 rows and « Charger plus (N) » adds 60.
- **« Sélectionner »** turns on multi-select with a trade-only bar, « Échanger (N) ». It records an exchange like the one described under [Vinted](#vinted), minus the parts that need a listing: nothing here is listed, so there is no listing to drop, no automatic replacement and no partner notice. The restock alerts are shown in the recap.
- **« Lots en stock (N) »**: lots parked in Stock appear below the cards, each with an editable quantity and « Mettre en vente ».
- Items moved to Stock are not listed on this page.

**Main files:** `app/(app)/stock/page.tsx` · [components/stock/StockList.tsx](../components/stock/StockList.tsx) · [components/stock/StockRow.tsx](../components/stock/StockRow.tsx) · [components/stock/StockFilters.tsx](../components/stock/StockFilters.tsx) · [components/lots/StockLotSection.tsx](../components/lots/StockLotSection.tsx) · [components/vinted/ExchangeOnConflictModal.tsx](../components/vinted/ExchangeOnConflictModal.tsx) · [lib/utils/group-cards.ts](../lib/utils/group-cards.ts) · `app/api/cards/[id]/clone/route.ts`

## Journal

Route `/ptcg` (page file `app/(app)/ptcg/page.tsx`), nav label « Journal ». The first of four pages on the owner's Pokémon TCG Live games (Journal, Tournois, Stats, Drill). Games are private to each account: the partner has the same pages but sees only her own data.

**What you do**

1. Paste a battle log, copied as is from PTCG Live, into the text box (« Log de bataille PTCG Live… ») and press « Ajouter ». Nothing is saved yet: `POST /api/ptcg/games/resolve` parses the log and proposes the two decks.
2. « Confirme les decks » (« Corrige les sprites détectés si besoin. ») shows the result (« Victoire », « Défaite », « Égalité ») and the two decks as up to two Pokémon sprites each (« Mon deck », « Deck adverse »). Tapping a sprite opens a searchable grid of the 1025 species (name in French or English), a « Méga » toggle to pick a Mega form, and a first tile that clears the slot. « Enregistrer » stores the game.
3. The history lists games by day, newest first. Only the latest day starts open. Each day header shows the date, one sprite per deck you played that day and the record « 3V · 1D · 0N ». A row shows the result and « contre {deck adverse} » (the opponent's username while the deck is unclassified), a « 1er » / « 2e » badge for who went first, and both decks. Winning rows are tinted green and losing rows red.
4. The pencil (« Corriger les decks ») re-opens the same dialog for a saved game. Clicking a row expands a coloured transcript: « Préparation », then one block per turn (« Tour 3 · toi »), your turns tinted, the log lines verbatim.

**Rules worth knowing**

- **French client only.** The parser reads the French phrasings of the PTCG Live battle log. Anything else is refused with « That does not look like a PTCG Live battle log. » (`ptcg_unparsable_log`); an empty paste gives `ptcg_empty_log`. Lines the parser does not recognise never block an import.
- **Who is "me".** The exporting player is the one whose opening hand is spelled out in the log.
- **Date.** A game is dated when it is imported, not when it was played.
- **No duplicates.** The key is the SHA-256 of the trimmed log, unique per account. Importing the same log again updates the existing game instead of failing.
- **What is stored.** The raw log (the source of truth), the reconstructed per-turn state (about 1 MB per game, so the list never selects it and it is fetched when a row expands), a validation report and the parser version. The validation replays the damage breakdowns printed in the log against the reconstruction; a mismatch is a warning, never a refusal. Gameplay data for every card seen is cached from TCGdex into `ptcg_cards`, shared between accounts. The import route is allowed 60 s for that card lookup.
- **Deck sprites.** For each side, up to two Pokémon: those that dealt the most damage in the game (summed per card, so an evolution counts as a different card), or, if nobody attacked, the one that spent the most turns Active. A Mega form wins over its base form. Your correction is stored and always overrides the automatic choice; an empty correction means "deliberately unclassified".
- **Result.** Read from the final « … gagne. » line. « Égalité » is the parser's fallback when it cannot tell, since PTCG Live never produces a real tie, so it is never tinted and is meant to be corrected in the dialog.
- **Analyses.** The same route accepts an `analysis` (verdict, findings anchored to log lines, a checklist) produced outside the app by the ptcg-coach workflow, and a complete `.bundle.json`. Findings that point at a line outside the log are refused. The import stores the analysis and a 0–100 play score (errors cost 18 points, warnings 8, notes 4, an error that cost two prizes or more 35; good plays add 5 each, capped at 12 in total). No page shows the analysis text today; the score feeds « Score moyen » in [Stats](#stats).

**Main files:** `app/(app)/ptcg/page.tsx` · [components/ptcg/BattleLogsPage.tsx](../components/ptcg/BattleLogsPage.tsx) · [components/ptcg/CreateLogModal.tsx](../components/ptcg/CreateLogModal.tsx) · [components/ptcg/GameLogViewer.tsx](../components/ptcg/GameLogViewer.tsx) · [components/ptcg/PokemonPicker.tsx](../components/ptcg/PokemonPicker.tsx) · [app/api/ptcg/games/route.ts](../app/api/ptcg/games/route.ts) · [app/api/ptcg/games/resolve/route.ts](../app/api/ptcg/games/resolve/route.ts) · [lib/ptcg/index.ts](../lib/ptcg/index.ts) · [lib/ptcg/bundle.ts](../lib/ptcg/bundle.ts) · [lib/ptcg/protagonists.ts](../lib/ptcg/protagonists.ts) · [lib/ptcg/archetype-dex.ts](../lib/ptcg/archetype-dex.ts) · [lib/ptcg/score.ts](../lib/ptcg/score.ts)

## Tournois

Routes `/ptcg/tournaments` and `/ptcg/tournaments/<id>` (page files under `app/(app)/ptcg/tournaments/`), nav label « Tournois ». A log of the events you play, one row per tournament and one per round. Private to the account.

**The list.** Each tournament shows your deck sprites, its name, the date, the record (« 4V · 2D · 1N ») and a pill with the placement. A dropdown filters by category: « Toutes catégories », « En ligne », « Locaux », « Challenge », « Cup », « Régionaux », « Internationaux », « Mondiaux ».

**« Nouveau tournoi »** asks for:

- « Nom du tournoi » (for example « Meisia Cup »);
- « Date » (today by default);
- « Catégorie » (« En ligne » by default);
- « Format »: « Bo1 » (default) or « Bo3 »;
- « Classement »: « Aucun classement » (default), « Abandon », « Top 1024 » down to « Top 2 », « Vainqueur »;
- « Mon deck »: up to two sprites, fixed for the whole tournament.

**The tournament page** shows the same header with a pencil to edit, then the rounds.

- « Ajouter un round » asks for the opponent's deck (up to two sprites) and the games. Game blocks (« Partie 1 »…) appear one at a time, each with « Victoire » / « Défaite » / « Égalité » and « 1er » / « 2e » for who went first. A Bo1 has one block; a Bo3 stops asking as soon as a side has two wins, so a 2–0 never shows a third.
- « Autre issue »: « ID » (a drawn round, counted as a tie), « Forfait » (counted as a loss) or « Bye » (counted as a win). Picking one clears the games, and entering a game clears the special outcome; a round is either played out or has a special outcome, never both.
- A round needs at least one game or an outcome to be saved. Round numbers are assigned automatically (highest + 1).
- A row shows « Round n », the opponent's sprites and the result as letters (« WLW ») or the special outcome, tinted green, red or amber. The ⋯ menu offers « Modifier le round » and « Supprimer le round » (« Cette action est irréversible. »).
- A round's result is never stored; it is recomputed from its games each time (more game wins than losses is a win), so correcting one game fixes everything ([lib/ptcg/tournaments.ts](../lib/ptcg/tournaments.ts)).

**Main files:** `app/(app)/ptcg/tournaments/page.tsx` · [components/ptcg/TournamentsPage.tsx](../components/ptcg/TournamentsPage.tsx) · [components/ptcg/TournamentDetailPage.tsx](../components/ptcg/TournamentDetailPage.tsx) · [components/ptcg/TournamentModal.tsx](../components/ptcg/TournamentModal.tsx) · [components/ptcg/RoundForm.tsx](../components/ptcg/RoundForm.tsx) · [lib/ptcg/tournament-meta.ts](../lib/ptcg/tournament-meta.ts) · [lib/ptcg/tournaments.ts](../lib/ptcg/tournaments.ts) · `app/api/ptcg/tournaments/route.ts`

## Stats

Route `/ptcg/stats` (page file `app/(app)/ptcg/stats/page.tsx`), nav label « Stats ». Statistics over all your logged games plus your tournament rounds. The subtitle counts both (« 24 duels analysés »). With nothing to analyse it says « Aucune partie à analyser » and offers « Importer », which leads to the Journal.

It drills down in three levels, with a back button on each:

1. **Your decks**, grouped by their sprite set, most played first: sprites, record « 12-5-1 », win rate (green from 50 % up, red below) and « Dernière partie ». Games without sprites are grouped as « Non classé ».
2. **Matchups** for one deck: a pinned « vs All » row, then one row per opponent deck with record, win rate, the win rates « Premier » and « Second » and the last date played.
3. **Detail** for the chosen slice. Four figures at the top (« Parties », « Winrate », « Bilan », « Score moyen »), then:
   - « Premier / Second »: win rate when you went first and when you went second.
   - « Départs »: « Parties avec misère » (share of games with a hand without a Basic Pokémon), « Pokémon en jeu fin T2 » (average board at the end of your second turn) and the distribution of your starting Active Pokémon.
   - « Vitesse de setup »: « Première évolution ≤ T2 » and « Première attaque ≤ T2 » (T2 is your own second turn).
   - « Moteur »: « Tours avec Supporter » (share of your turns on which a Supporter was played), « Cartes piochées / partie » (opening hand excluded) and « Talents déclenchés » (the ten most used, with average per game and the share of games).
   - « Tempo »: « Première récompense prise », « KO infligés / subis » per game and « Tours par partie ».
   - « Usage des cartes »: per card, plays, discards and plays per game, with a « morte ? » flag on a card that was discarded but never played. Basic Energy is left out.
   - « Attaquants » (attacks, total damage, damage per attack), « Attaches » (which card went on which Pokémon) and « Récupérations » (a card played, then the card it brought back from the discard pile).

**Rules worth knowing**

- Everything is recomputed from the raw logs at every page load, with patterns over the French client's phrasings. A phrasing the parser does not know can under-count a line; it never changes a game's result, which is re-read from the log's final line.
- Tournament rounds count in games, wins, losses, win rate and the first/second split (taken from the round's first game), but not in the per-turn figures, which only use logged games.
- The tables for starters, card usage, attackers, attachments and recoveries show only cards of a hard-coded current decklist ([lib/ptcg/current-decklist.ts](../lib/ptcg/current-decklist.ts)), to hide cards cut from earlier versions of the owner's deck. For any other deck those tables come out empty until the list is edited.
- « Score moyen » averages the play scores of games imported with an analysis, and shows « — » otherwise.

**Main files:** `app/(app)/ptcg/stats/page.tsx` · [components/ptcg/StatsPage.tsx](../components/ptcg/StatsPage.tsx) · [components/ptcg/StatsDetailSections.tsx](../components/ptcg/StatsDetailSections.tsx) · [lib/ptcg/game-stats.ts](../lib/ptcg/game-stats.ts) · [lib/ptcg/stats-page-data.ts](../lib/ptcg/stats-page-data.ts) · [lib/ptcg/current-decklist.ts](../lib/ptcg/current-decklist.ts)

## Drill

Route `/drill` (page file `app/(app)/drill/page.tsx`), nav label « Drill ». A timed prize-check trainer: « Donner en moins de 45 s le nombre de cartes prizées pour tes N cibles. ». You fan through your deck, then say how many copies of chosen cards are hidden in the six prizes. Profiles are private to the account.

**Profiles.** « Nouveau profil » asks for:

- « Nom du profil » (for example « Typhlosion »);
- the decklist, pasted from PTCG Live's French export (« Colle ta decklist (export PTCG Live) ») and parsed with « Analyser ». The sections « Pokémon : », « Dresseur : » and « Énergie : » are read; lines are `<count> <name> <SET> <number>`, and two lines for the same print are merged. Set codes with a subset suffix (`LOR-TG`) or a leading digit (`30C`) are accepted;
- the cards to check (« Coche les cartes à checker »). At least one is required to save;
- a sprite (« Sprite du profil »), required, with the same Pokémon picker as the Journal.

Each card is looked up in `tcg_catalog` by set code and number (French first, English otherwise) for its name and image. A line that is not found stays in the list as text (« Non trouvée dans le catalogue — affichée en texte. »). Images are re-resolved each time a profile starts. A profile can be edited (the list is rebuilt into the text box) or deleted from its ⋯ menu.

**A run** (« Démarrer »)

- All copies in the list are shuffled. In « Standard » (« Deck de 54 visible, 6 prizes cachées ») six cards are set aside as prizes and the rest of the deck is shown. In « Réel » (« Main de 7 révélée : calcule l'attendu ») seven more cards are drawn as a hand and shown first, so the expected count changes with the hand.
- Card images are loaded before the timer starts (8 s limit per image; a failed one becomes a text tile). The deck is shown as an overlapped fan you thumb through horizontally, with a counter « n/N vues ». The timer counts down from 45 s, turns red at 10 s and keeps counting up with a « + » once past 45 s.
- « Terminer le scan » (or the button at the end of the fan) moves to the answer screen: for each target choose 0 up to its number of copies (4 at most). « Vérifier » shows the score « x/N », the scan time, the true count for each card and a short coaching sentence that depends on the score and the time.
- « Rejouer » restarts in the same mode.

**Records.** The last 8 runs, « Parfaits » (all targets right within 45 s), « Meilleur parfait » (the fastest run with every target right) and « Série » (consecutive perfect runs) are kept in the browser's `localStorage` under one key (`iris-drill-425-v2`). They are per device, shared by all profiles on it, and not synced. The home screen also lists a three-step progression plan.

**Main files:** `app/(app)/drill/page.tsx` · [components/ptcg/DrillHome.tsx](../components/ptcg/DrillHome.tsx) · [components/ptcg/DrillProfileForm.tsx](../components/ptcg/DrillProfileForm.tsx) · [components/ptcg/PtcgDrill.tsx](../components/ptcg/PtcgDrill.tsx) · [lib/ptcg/decklist.ts](../lib/ptcg/decklist.ts) · [lib/ptcg/drill-resolve.ts](../lib/ptcg/drill-resolve.ts) · `app/api/ptcg/drill-profiles/route.ts` · [app/api/ptcg/drill-profiles/resolve/route.ts](../app/api/ptcg/drill-profiles/resolve/route.ts)

## Événements

Route `/events` (page file `app/(app)/events/page.tsx`), nav label « Événements ». The upcoming Pokémon events of local shops, gathered by a scraper so nobody has to visit nine websites. The subtitle reads « N événement(s) à venir ».

- **Which events.** From the start of today (UTC) onward, soonest first, plus events whose date could not be read, which come last. At most 500.
- **Two views.** « Calendrier » (the default) and « Liste ». The calendar is a month grid, Monday first, with previous/next month buttons. Each day shows one coloured pin per shop that has an event (at most four), today is circled and past days are dimmed. Clicking a day lists its events beside the grid on a wide screen and below it on a phone, with « Aucun événement ce jour-là. » when empty.
- **A row** shows the date block (day, start time or « journée » when only the date is known, end time), a bar in the shop's colour, the title, a type pill (« Avant-première », « Tournoi », « League Cup », « League Challenge », « Ligue »), the shop and city, the price when above 0, the free spots (« N place(s) », or « Complet » in red at 0) and an external link to the event page.
- **Filters.** A search box (« Rechercher (titre, boutique, ville)… », accent-insensitive), one chip per type and a city dropdown that only appears when more than one city is present. A counter reads « N sur M ».
- **« Boutiques suivies ».** A legend lists each shop with its colour, city and number of upcoming events, linking to the shop's own events page. The shop directory is a single list in [lib/data/event-sources.ts](../lib/data/event-sources.ts) shared by the scraper and this page.

**How the data arrives.** Nine Paris shops are followed. Eight are read automatically from their sites; the ninth, Le Coin des Barons, publishes a monthly Instagram poster and its events are transcribed by hand. A GitHub Action runs the scraper every 30 minutes and installs headless Chromium for the shops whose pages need a browser. For each shop it replaces that shop's rows only when the extraction succeeds; if a shop's site is down, its previous events stay. Events are keyed on an external id, so a re-run does not duplicate them.

**Main files:** `app/(app)/events/page.tsx` · [components/events/EventsView.tsx](../components/events/EventsView.tsx) · [components/events/EventsCalendar.tsx](../components/events/EventsCalendar.tsx) · [components/events/EventRow.tsx](../components/events/EventRow.tsx) · [components/events/ShopLegend.tsx](../components/events/ShopLegend.tsx) · [lib/utils/filter-events.ts](../lib/utils/filter-events.ts) · [lib/utils/event-calendar.ts](../lib/utils/event-calendar.ts) · [lib/data/event-sources.ts](../lib/data/event-sources.ts) · [scripts/store-events/core.ts](../scripts/store-events/core.ts) · [.github/workflows/store-events.yml](../.github/workflows/store-events.yml)

## Activité

Route `/logs` (page file `app/(app)/logs/page.tsx`), nav label « Activité », page title « Logs d'activité » (« Toutes les actions utilisateur, agent et système »). The audit trail of the app, readable by both accounts.

- **A row** shows a coloured dot, an actor badge (« Utilisateur », « Agent » or « Système »; the two accounts' actions are named), the action in plain French (« Carte créée », « Annonce publiée », « Restock détecté »…), the card or lot name when there is one, the time and the first eight characters of the entity id. A row that has details expands to show them as JSON.
- **Dots.** Green for listing and job actions, red for deletions and failures, yellow for migrations and system detections, blue for the rest.
- **Filters.** The actor buttons « Tous · Utilisateur · Agent · Système » and a text box « Filtrer par action… » that matches the start of the action name (`card.`, `listing.`…). A counter reads « N entrées ».
- **Paging.** 100 entries at first, « Charger plus » adds 100; the API caps a page at 200 ([app/api/logs/route.ts](../app/api/logs/route.ts)).
- **What is recorded.** Card creation (single and batch), photo change, clone, status change, price change, deletion and Pokédex replacement; lot creation, update, status change and deletion; Vinted jobs created or failed; listings flagged online by hand, posted by the bot or deleted; listings moved or dropped when a card is promoted; and the restock and promotion detections. Twenty-two action names have a French label; any other shows its raw name, which is the case for the Item actions.
- **Writing is fire-and-forget.** `auditLog()` writes through the service role and swallows its own errors, so a failed log line never blocks the action it describes. Sellers' and agent names in the labels are tied to the two user ids that are hard-coded in the component.

**Main files:** `app/(app)/logs/page.tsx` · [components/logs/LogsClient.tsx](../components/logs/LogsClient.tsx) · [lib/utils/audit-log.ts](../lib/utils/audit-log.ts) · [app/api/logs/route.ts](../app/api/logs/route.ts) · [vinted-agent/audit_log.py](../vinted-agent/audit_log.py)

## Options

Route `/options` (page file `app/(app)/options/page.tsx`), the last of the 15 navigation entries. « Préférences et compte. » Six cards:

1. **« Apparence »**: « Mode clair » / « Mode sombre ». Dark is the default. The choice is stored in the `theme` cookie for a year and applied at once; it also sets the colour of the Android status bar (`#111110` dark, `#fafaf9` light).
2. **« Langue »**: English, Français, 日本語, 中文 (see [Languages](#languages)).
3. **« Compte »**: the signed-in email and « Déconnexion », which ends the session and returns to `/login`.
4. **« Installation »**: the permanent install control (see [PWA installation](#pwa-installation)).
5. **« Prix Cardmarket »: « Rafraîchir tous les prix ».** Forces a refresh of every Vinted, Stock and Pokédex card without waiting for the next scheduled run. The button calls `POST /api/prices/update?since=<time of the click>` repeatedly. Each call refreshes the next 200 cards not yet refreshed since the click; it stops at the first empty answer or after 50 calls, which caps one press at 10,000 cards. Progress reads « Traité n · Mis à jour n · Skipped n », and the end « Terminé — N cartes traitées (X mises à jour, Y skipped, Z erreurs) ». Cards that cannot be priced (variants kept manual, missing identifiers, set not on Cardmarket) are also stamped as processed so the loop ends.
6. **« Backup manuel »**: « Créer un backup maintenant » asks for a confirmation (« Snapshot complet de toutes vos données. Gardé sans rotation. Continuer ? »). It reads eight tables page by page and stores them as `iris-YYYY-MM-DD-HHMMSS.json.gz` in the private `manual-backups` bucket. « Backups existants (N) » lists the latest 100 with size, « Télécharger » (a signed link valid for one hour) and « Supprimer » (after confirmation). Manual backups are never rotated.

**Automatic backups.** A GitHub Action runs at 03:00 UTC, dumps the same eight tables with `pg_dump --data-only`, compresses them and publishes a pre-release tagged `backup-daily-YYYY-MM-DD`. Sundays also create `backup-weekly-…` and the 1st of the month `backup-monthly-…`. A rotation step keeps the latest 30 daily, 12 weekly and 12 monthly ([scripts/backup/rotate.sh](../scripts/backup/rotate.sh)). The eight tables are `cards`, `lots`, `card_listings`, `lot_listings`, `user_profiles`, `config`, `ocr_usage_log` and `stock_value_snapshots`. Photos, price history, Items, the PTCG tables and the bot's tables are not in them. There is no restore screen: restoring a dump is a manual `psql` operation.

**Main files:** `app/(app)/options/page.tsx` · [components/options/RefreshAllPricesSection.tsx](../components/options/RefreshAllPricesSection.tsx) · [components/options/ManualBackupSection.tsx](../components/options/ManualBackupSection.tsx) · [components/options/PWAInstallSection.tsx](../components/options/PWAInstallSection.tsx) · [components/layout/ThemeToggle.tsx](../components/layout/ThemeToggle.tsx) · [components/layout/LanguageToggle.tsx](../components/layout/LanguageToggle.tsx) · [app/api/backup/manual/route.ts](../app/api/backup/manual/route.ts) · `app/api/backup/manual/[filename]/route.ts` · [.github/workflows/backup.yml](../.github/workflows/backup.yml)

## Login

Route `/login` (page file `app/(auth)/login/page.tsx`), the only public page. « Gestion de collection Pokémon TCG ».

- **Form.** « Email », « Mot de passe », « Se connecter » (« Connexion… » while waiting). An empty field gives « Email et mot de passe requis. ». Any other failure shows Supabase's own message, in English.
- **There is no sign-up.** The two accounts are created by hand in Supabase with email sign-ups disabled ([SETUP.md](SETUP.md)).
- **Who gets redirected.** Every page except `/login` redirects an anonymous visitor to `/login`; an API call from an anonymous client gets a `401` JSON answer instead of a redirect. A signed-in visitor on `/login` is sent to `/`, which lands on the dashboard.
- **Session.** Supabase cookies are refreshed on every request by `proxy.ts` (the Next.js 16 middleware), so a session persists across visits.
- **Exceptions to the check.** The two cron endpoints (`/api/prices/update`, `/api/prices/snapshot`) skip the session check and are protected by `CRON_SECRET`; static assets and the manifest are public too.

**Main files:** `app/(auth)/login/page.tsx` · `app/(auth)/login/login-form.tsx` · `app/(auth)/login/actions.ts` · [proxy.ts](../proxy.ts) · [lib/supabase/proxy.ts](../lib/supabase/proxy.ts)

## Mobile navigation

On screens under 768 px the sidebar is replaced by a bottom bar in the style of Pokémon HOME ([components/layout/BottomNav.tsx](../components/layout/BottomNav.tsx)).

- **Layout.** « Scanner » on the left, « Vinted » on the right, and a raised Pokéball in the middle. The Vinted tab carries a small dot that is green while the posting agent is online and grey otherwise.
- **The bubble.** Tapping the ball spins it one full turn and pops a panel with the other 13 entries in a three-column grid (Dashboard, Prix, Pokédex, Stamps, Bot Vinted, Stock, Journal, Tournois, Stats, Drill, Événements, Activité, Options). Tapping an entry, the ball or the backdrop closes it. The ball gets a red halo while the bubble is open or when the current page is one of its entries.
- **Active entry.** The highlighted entry is the one with the longest matching path, so `/ptcg/stats` lights Stats and not Journal, and `/vinted/bot` lights Bot Vinted and not Vinted ([components/layout/nav-items.ts](../components/layout/nav-items.ts)).
- **Desktop.** From 768 px up a fixed 220 px sidebar lists all 15 entries with the logo and, at the bottom, the agent status (« Agent connecté » / « Agent déconnecté »).
- **Page chrome.** Pages are centred in at most 1200 px (the bot page is full width), with bottom padding for the bar. On an installed iPhone, content respects the notch and home-indicator insets.
- **Navigation freshness.** The Next.js router cache is configured so that a dynamic page visited again is refetched once on navigation (`staleTimes.dynamic = 0`). This replaced an earlier component that forced a second refresh after every navigation.

**Main files:** [components/layout/BottomNav.tsx](../components/layout/BottomNav.tsx) · [components/layout/Sidebar.tsx](../components/layout/Sidebar.tsx) · [components/layout/nav-items.ts](../components/layout/nav-items.ts) · [components/layout/PageWidthContainer.tsx](../components/layout/PageWidthContainer.tsx) · [next.config.ts](../next.config.ts)

## PWA installation

I.R.I.S can be installed on a home screen and then opens without browser chrome.

- **Manifest** ([app/manifest.ts](../app/manifest.ts)): name « I.R.I.S — Intelligent Recognition Inventory System », short name « I.R.I.S », `start_url` `/dashboard`, standalone display, portrait, dark background `#111110`, icons at 192 and 512 px plus a maskable 512 px, and the page language from the active locale.
- **Service worker** ([public/sw.js](../public/sw.js)): registered in production only. It caches the immutable build assets (`/_next/static/` and fonts) so the bundle loads instantly on reopening. Pages, server data and API calls are never cached, so the app needs a connection and never shows stale data. Development builds unregister it, because it would pin an old bundle.
- **Install banner** ([components/layout/InstallPrompt.tsx](../components/layout/InstallPrompt.tsx)), shown at the bottom of every page:
  - *Chrome, Edge, Android*: waits for the browser's `beforeinstallprompt` and then shows « Installer I.R.I.S » with an « Installer » button.
  - *iOS Safari*: shows the banner straight away with « Comment ? », which opens a three-step dialog: touch the share button, « Sur l'écran d'accueil », then « Ajouter ».
  - *Dismissal*: the cross (« Plus tard ») hides it for 14 days (`iris.pwa.installDismissedAt` in `localStorage`). It shows at most once per browser session, because the layout remounts the component on every navigation.
  - It never shows when the app already runs standalone, and it does not show in desktop Safari or Firefox, which have no install path.
- **Always-available control.** The « Installation » card in [Options](#options) adapts to the platform: « I.R.I.S est installée sur cet appareil. » when installed, « Installer l'application » on Chrome/Edge/Android, « Voir les étapes » on iOS, and « Ton navigateur ne propose pas d'installation directe… » elsewhere.

**Main files:** [app/manifest.ts](../app/manifest.ts) · [public/sw.js](../public/sw.js) · [components/layout/ServiceWorkerRegister.tsx](../components/layout/ServiceWorkerRegister.tsx) · [components/layout/InstallPrompt.tsx](../components/layout/InstallPrompt.tsx) · [components/options/PWAInstallSection.tsx](../components/options/PWAInstallSection.tsx) · [lib/utils/pwa-install.ts](../lib/utils/pwa-install.ts)

## Languages

The interface exists in four languages: English (the default), French, Japanese and Simplified Chinese. The owner uses French day to day, so French is the reference for every label in this document.

- **Messages.** `messages/en.json`, `fr.json`, `ja.json` and `zh.json`, loaded with [next-intl](https://next-intl.dev). Each holds about 1,240 keys in 39 namespaces. English is also the typed source: a key used in the code but missing from `en.json` fails the TypeScript build. A missing key in another language shows its key path rather than breaking the page.
- **Choosing a language.** On the first visit `proxy.ts` sets a `lang` cookie from the browser's `Accept-Language` (the first tag whose base language is supported, otherwise English) and never overwrites it afterwards. The switch in [Options](#options) writes the cookie for a year and refreshes the page. URLs have no locale prefix.
- **API errors** share one shape, `{ ok: false, error: "snake_case_code", message: "English fallback" }`. The client looks up `errors.<code>` (about 35 codes) and falls back to the English `message`.
- **Left untranslated on purpose**: set names from Cardmarket and TCGdex, card names as printed, and OCR text. Pokémon names in the deck pickers come from a static table in French, English and Japanese.
- **Numbers and dates.** Prices always use French formatting (`12,50 €`) and most dates do too (`12/05/26`); a few lists, such as the Journal and Activité, follow the browser's locale.
- **Not yet translated.** A few surfaces hold French literals in the components: the whole [Bot Vinted](#bot-vinted) page, some Dashboard widgets (« Dernières ventes », « Postées sur Vinted aujourd'hui », the sales tile labels), the « Prix manquant » chip and the Items category search placeholder.

**Main files:** [i18n.ts](../i18n.ts) · [proxy.ts](../proxy.ts) · [components/layout/LanguageToggle.tsx](../components/layout/LanguageToggle.tsx) · [lib/utils/translate-error.ts](../lib/utils/translate-error.ts) · [lib/utils/api-response.ts](../lib/utils/api-response.ts)

## The two-user model

I.R.I.S is built for two people who share one collection but sell from two Vinted accounts. There is no third user and no public sign-up.

**Identity.** Each account has a row in `user_profiles` with a display name, « Lui » and « Elle ». The app matches the name to a colour token, blue (`--color-user-lui`) for « Lui » and pink (`--color-user-elle`) for « Elle » ([lib/utils/user-colors.ts](../lib/utils/user-colors.ts)). Your own actions always render in the default tone and labelled « Moi »; only the partner is tinted, so a list showing both of you is easy to read.

**What is shared and what is not**

| Data | Who can do what |
|---|---|
| Cards and lots | Shared. Both accounts read and write the same rows; there is no ownership. |
| Photos | The `card-photos` and `lot-photos` buckets are open to both accounts. |
| Listing state (`card_listings`, `lot_listings`) | Readable by both; each account writes only its own row. This is what lets one card be online on two Vinted accounts. |
| The bot's queue, schedule, settings, logs, jobs and heartbeat | Readable by both (this makes the account switcher on [Bot Vinted](#bot-vinted) work). Each account writes its own; the one cross-account write is the cookie form. |
| Vinted sessions (`vinted_sessions`) | Private to each account. |
| Price data, activity log, OCR usage | Shared, read by both. |
| Journal, Tournois, Stats, Drill (`ptcg_*` tables) | Private: each account sees only its own games, tournaments and profiles. The card reference data they use is shared. |
| Items | The owner only (see [Items](#items)). |

**Vinted-enabled accounts.** The accounts allowed to post and monitor are listed in the `VINTED_USER_IDS` environment variable. Both are in practice, and the post and bump routes, the bot page and the cookie form all check it.

**Cross-account behaviour**

- The Vinted filter bar can slice the list by who is listing: « Par moi », « Par {partenaire} », « Cross-listées », « Non listées », « À retirer ».
- When one account sells a card, the other account's live ad for it gets an automatic `delete` job and a notice (« Action requise pour {nom} »). Recording an exchange can instead hand the listing over to a Stock copy so nothing needs to come down.
- When a Stock copy is promoted to replace a sold card, the partner's live listing is moved to the new card, so it does not show « À retirer ».
- When a card sells out of Stock, the dashboard and Pokédex show a restock alert to whoever sees the page.
- Retiring a card to Stock keeps it for sale when the partner still has a live ad on it.
- The sales tiles on the dashboard, the all-time totals under « Dernières ventes » and the actor names in [Activité](#activité) are tied to the two hard-coded user ids.

**Main files:** [lib/hooks/useUserContext.tsx](../lib/hooks/useUserContext.tsx) · `app/(app)/layout.tsx` · [lib/utils/user-colors.ts](../lib/utils/user-colors.ts) · [lib/utils/listings.ts](../lib/utils/listings.ts) · [lib/vinted/cross-user-sync.ts](../lib/vinted/cross-user-sync.ts) · [lib/vinted/monitoring-auth.ts](../lib/vinted/monitoring-auth.ts) · [SUPABASE.md](SUPABASE.md)

## Scheduled jobs

Everything that runs without a click. Times are UTC.

| When | What | Where |
|---|---|---|
| Every 30 min | Scrape the nine shops' events into `store_events` | [store-events.yml](../.github/workflows/store-events.yml) |
| Every 10 min, 06:00 to 23:59 | Ping `/login` so the serverless function stays warm | [keep-warm.yml](../.github/workflows/keep-warm.yml) |
| 01:07 daily | Re-upload Cardmarket's public price and product dumps to Supabase | [cardmarket-prices.yml](../.github/workflows/cardmarket-prices.yml) |
| 03:00 daily | Backup of eight tables as a GitHub release, then rotation | [backup.yml](../.github/workflows/backup.yml) |
| 08:00, 14:00, 20:00 | Refresh up to 700 card prices (`/api/prices/update?limit=700`) | [vercel.json](../vercel.json) |
| 23:55 daily | Write the day's `price_history` rows (`/api/prices/snapshot`) | [vercel.json](../vercel.json) |
| Sundays 04:00 | Fold old `price_history` rows into weekly and monthly medians | `pg_cron`, defined in `supabase/migrations/20260513000000_price_history.sql` |
| Every 5 min (agent) | Scheduler: decide whether to post or repost | [vinted-agent/main.py](../vinted-agent/main.py) |
| Every 30 s (agent) | Heartbeat | [vinted-agent/main.py](../vinted-agent/main.py) |
| Every 5 s (agent) | Look for category-attribute requests from the Items form | [vinted-agent/main.py](../vinted-agent/main.py) |

Both Vercel crons authenticate with `CRON_SECRET`. `/api/prices/update` also accepts a signed-in session (the button in Options uses it); `/api/prices/snapshot` accepts only the secret. Endpoints and scripts are listed in [COMMANDS.md](COMMANDS.md).
