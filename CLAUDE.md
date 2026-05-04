# I.R.I.S — Notes pour les agents IA

## Le projet en 30 secondes

PWA mono-utilisateur (Next.js 16, App Router, TypeScript, Tailwind v4, Supabase, Vercel) pour gérer une collection Pokémon TCG. Deux flux : Pokédex (1 carte par Pokémon, 1025 cellules) et stock Vinted (FIFO + prix Cardmarket live + générateur d'annonces).

Spec complète : [context.md](context.md) (historique, voir bilan ci-dessous pour l'état actuel). Bilan détaillé : [docs/phases-summary.md](docs/phases-summary.md).

## Avancement

- **Phase 1** — TERMINEE. Auth, layout, OCR, enrichissement TCGdex, scan mobile, suggestion Pokédex, grille Pokédex, candidate picker. 52 tests, 0 lint warning.
- **Phase 1.11** — TERMINEE. Catalogue local Pokémon TCG via scraping LimitlessTCG. 111K cartes JP/EN/FR/DE/IT/ES/PT. Enrichissement post-scan passe de 33% à 63-73% (test bench). 81 tests, 0 lint warning.
- **Phase 1.12** — TERMINEE. Gemini 3 Flash Preview comme moteur OCR primaire. Extraction structurée JSON (`card_name`, `set_code`, `set_number`, `language`, `confidence`). Bench : 28/30 (93%), fallback Google Vision. Cost : 6¢/mois pour 100 scans. 97 tests, 0 lint warning.
- **Phase 1.13** — TERMINEE. Traductions FR via Gemini (4 nouveaux champs `pokemon_number`, `pokemon_name_fr`, `set_name`, `set_name_fr`) → noms affichés `"FR (Original)"` (ex: `"Gruikui (チャオブー)"`). Scanner UI 2-colonnes + loupe magnifier 1.5× + dropdown variant (Poké Ball / Master Ball / Reverse Holo / Promo) + notes. Pokédex 3 modes d'affichage (grid-3 / grid-5 / list) persistés en localStorage. Migration `add_cards_variant`. 116 tests, 0 lint warning.
- **Phase 2** — TERMINEE. Module Vinted : liste FIFO + groupement variant-aware (`card_id_tcg + language + condition + variant`), édit prix inline, action "Vendu" + restock toast, générateur d'annonce avec smart-truncate titre 80 chars + clipboard. 144 tests, 0 lint warning.
- **Phase 2.1** — TERMINEE. Restructuration Stock/Vinted en 2 pages distinctes + `vinted_listed_at` pour tracker "publié sur Vinted.com" (toggle 3 états offline/online/stale). Pokédex enrichi (1025 noms FR+EN, exact-number search, replace modal avec choix Stock/Vinted, scanner inline depuis le drawer, hard block mismatch via `pokemon_number`). Stock comme miroir de Vinted (groupement, tag Pokédex, compteur ×N éditable, clone endpoint, sort date_added ASC). Modale `MoveToPokedexModal` partagée Stock+Vinted (clic sur "Pas Pokédex" → confirm + sub-flow swap si slot occupé). AnnonceModal redesign (PiP mobile, Download img anti-bot, templates v2 avec mapping condition/langue). Options page (6e onglet) avec ThemeToggle 2-boutons + SignOut. RPC `replace_pokedex_card` corrigée en 3-step (fix collision unicité for_sale). Filtres Vinted = chips mutuellement exclusifs (offline / stale / fresh / sold). 7 helpers purs ajoutés (`listing-stale`, `vinted-filter`, `vinted-sort`, `pokedex-mismatch`, `pokedex-swap`, `pokemon-names`, `image-postprocess`, `promote-detection`). 2 nouvelles migrations (`20260430130000_phase21_vinted_unique_listed`, `20260430200000_fix_replace_pokedex_card_3step`). **199 tests**, 0 lint warning, 0 type error.
- **Phase 3a** — TERMINEE. Cron pricing quotidien Vercel `0 2 * * *` UTC via TCGdex (`POST /api/prices/update`, protégé `CRON_SECRET`). Bulk mode (LIMIT 200, parallélisme 10, oldest first via `cm_updated_at ASC NULLS FIRST`) + single-card mode (`?card_id=X` derrière auth Supabase). 2 helpers purs : `categorize-pricing-card` (skip variant/KO/ZH, backfill auto pour cartes sans `card_id_tcg`), `format-staleness` (4 tons : fresh/stale/old/never). 2 composants UI : `<PriceFreshnessBadge>` + `<RefreshPriceButton>` intégrés dans VintedRow / StockRow / PokedexDrawer (drawer : label "Annonce" pour `suggested_price`, refresh + badge à droite de la cellule). `vercel.json` cron schedule ajouté. **Le cron ne touche JAMAIS `suggested_price`** (renommé "Annonce" en UI, valeur 100% user-définie via `EditablePriceCell`). Le cron écrit uniquement `cm_price_low/trend/avg` + `cm_updated_at` + backfill `card_id_tcg`/`cardmarket_id` si applicable. **218 tests**, 0 lint warning, 0 type error. Aucune nouvelle migration (toutes colonnes existaient depuis Phase 1).
- **Phase 3b1** — TERMINEE. Lots Vinted (bundles : ≥1 photos vendues comme un seul item). **Pivot vs plan initial** : abandon du "Mode lot ≤20 photos individuelles avec OCR par carte" (chronophage + OCR peu fiable). Remplacé par modèle "lot = entité distincte de `cards`" : table `lots` étendue (11 nouvelles colonnes : `name`, `language`, `condition`, `extra_description`, `price`, `status`, `date_sold`, `sold_price`, `vinted_listed_at`, `photo_urls jsonb`, `date_added`). Form rapide à 5 champs (nom + prix + langue + condition + description optionnelle) + multi-photo dropzone, preview live de l'annonce. Template hardcodé basé sur le format Vinted réel utilisateur (✨ titre, 📘 langue+drapeau, ✅ état, bloc shipping fixe Paris/92/95). 3 endpoints : `POST /api/lots` (multipart upload), `PATCH /api/lots/[id]`, `DELETE /api/lots/[id]`. Composants : `<LotForm>` (`/submit` onglet "Lot Vinted"), `<LotRow>` (interleavé dans `/vinted` avec badge "Lot" violet `text-rarity-chr`), `<LotAnnonceModal>` (carousel chevrons + dot indicators + arrow keys, copy clipboard, Download img anti-bot). Réutilise : `EditablePriceCell` + `VintedListedToggle` étendus avec prop `endpoint` optionnelle (default `/api/cards/[id]`, lots passent `/api/lots/[id]` + `priceField="price"`), `SoldModal` étendu avec discriminated union `entity: { kind: 'card'; card } | { kind: 'lot'; lot }` (+ shared `LANGUAGE_FEMALE`/`CONDITION_LABEL` exportés depuis `vinted-template.ts`). `<VintedFilters>` chip Type (Tout / Cartes / Lots). Migration `20260502120000_lots_vinted_bundle.sql`. **237 tests** (+19 vs Phase 3a : 7 lot-template + 5 POST + 7 PATCH/DELETE), 0 lint warning, 0 type error. Pas d'OCR, pas de Pokédex, pas de Stock, pas de cron pricing pour les lots.
- **Phase 3b2** — TERMINEE (v2 finale). Bulk import 100% web via la 4e tab `/submit` "Batch" (≤30 photos, OCR+enrich pré-batchés en parallèle puis **CardScanForm enchaîné carte-par-carte** — même UX que mobile, save → auto-advance au suivant). Status conflict for_sale → 409 actionnable côté serveur avec `existingCard` payload (photo + prix + meta). `<DuplicateForSaleModal>` affiche la carte existante et propose `[Annuler] / [Ajouter à mon Stock]` (re-POST avec status='collection' sur confirm). Helper `lib/utils/resize-image.ts` default 1600px (testé 1024 mais 8/30 cartes ratées en prod, set_code/set_number trop petits ; reverted), wired dans CardScanForm + LotForm + BatchForm. CardScanForm accepte des props prefill (`initialPhoto`, `initialOcr`, `initialEnrich`, `initialPhotoFilename`) pour le mode batch — useEffect d'init qui jump direct en phase `'reviewing'`. Status dropdown + champ Quantité (boucle POST × N, fallback collection sur copies suivantes si Pokédex). Search Vinted étendu aux lots (sur `name` + `extra_description` + `language`). **Le script Python a été dropé** — UX web suffit, plus de duplication TS↔Python. Cap raisonnable : 30 photos/batch (Vercel 60s + Gemini Tier 1 15 req/min). 242 tests vitest, 0 lint warning, 0 type error.
- **Phase 3c** — TERMINEE. **Volet 1 — Bulk vendu** sur `/vinted` : toggle "Sélection multiple", checkbox `accent-red` sur chaque ligne for_sale, `<BulkSelectionBottomBar>` + `<BulkSoldModal>` (liste items + total + preview live `splitPrice` cents-int), sequential PATCH avec capture restock+promote, `<BulkSoldRecapModal>` carousel + restock inline → drain `<PromoteAfterSoldModal>` chaîné. Lots respectent maintenant les chips d'état (`passesStateChips`/`shouldHideForSalePile` partagés). Restock alert ne fire plus si copies stock présentes (ajout `remainingStockCount`, route en 3 queries parallèles). **Volet 2 — Gemini tokens optim** : `usageMetadata` extracté + cost EUR (USD_TO_EUR=0.92), `maxOutputTokens=300`, prompt 500→360 tokens (réécrit multi-langue avec exemples JP/EN/FR/CN/KO + warning anti-hallucination JP-style), **`thinkingConfig: { thinkingBudget: 0 }` critique** (sans ça Gemini 3 brûle le budget en thoughts → fallback Vision systématique), parser `extractJsonObject` tolère prose+markdown fences. `_usage` + `_engine: 'gemini' | 'vision'` propagés au front (3 cas debug : `[Gemini]`, `[Gemini→Vision]`, `[Vision]`). Resize 1600→1400px. **Switch modèle** `gemini-3-flash-preview` → `gemini-3.1-flash-lite-preview` après bench multi-modèles (5/5 acc, −43% coût, −35% latence). Pricing $0.25 in / $1.50 out (étaient à Gemini 1.5 → 7× sous le réel). **Coût/scan : ~€0.000420**. **Volet 3 — Resilience enrichissement multilang** : `lookupSubseries` (TG/GG/Promo via parent set probes + dex disambig), `probeSubseriesByDex` (last-chance probe quand Gemini hallucine setCode), Strategy 2.5 catalog `lookupByNameAndLocalId` + `disambiguateByIllustrator` (auto-pick par illustrator), Strategy 5 Gemini-only fallback (KO/CN sans catalog), `language` Gemini propagé au form (avant le regex sniffait JP-only et tombait EN par défaut). **Volet 4 — UI polish** : mobile camera/gallery picker (drop `capture="environment"`), `UI_LANGUAGES = ['JP','EN','FR','KO','CN']` (DE/IT/PT/ES retirés des dropdowns), illustrator extracté + affiché dans le snippet OCR (signature unique), ZH→CN rename end-to-end. **Volet 5 — Catalog scraper Phase 3c** : `scripts/scrape-limitlesstcg.ts` étendu avec `parseIllustrator` + `enrichWithIllustrators` (concurrence 5, toggle `SCRAPE_ILLUSTRATOR=1`) + resume DB-driven (skip sets dont toutes rows ont déjà illustrator). Catalog DE/IT/ES/PT wipé (~58k rows). 2 nouvelles migrations (`20260504000000_rename_zh_to_cn.sql`, `20260504100000_tcg_catalog_illustrator.sql`). 4 nouveaux scripts bench (`bench-multi-model.ts`, `bench-multilang.ts`, `probe-tcgdex-fails.ts`). **279 tests** vitest, 0 lint warning, 0 type error. Brief : [PHASE_3.md](PHASE_3.md).
- **Phase 4** — A FAIRE. Passage à 2 users (RLS multi-tenant Supabase) + Import one-shot du profil Vinted existant (parser HTML profil → seed IRIS). Brief : [PHASE_4.md](PHASE_4.md).
- **Phase 5** — A FAIRE. Dashboard (KPIs valeur stock + top cartes rares + alertes restock + tracking tokens consommés et coût/jour) + polish PWA (install prompt, icônes 192/512, manifest fine-tune).

Bilan détaillé : [docs/phases-summary.md](docs/phases-summary.md).

## Stack à connaître

- **Next.js 16** — `proxy.ts` (pas `middleware.ts`), `params` est async, App Router strict, manifest via `app/manifest.ts`.
- **Tailwind v4** — config dans `app/globals.css` via `@theme` (pas de `tailwind.config.ts`).
- **Supabase** — via `@supabase/ssr` (helpers dans `lib/supabase/`).
- **TCGdex** — Fallback API live pour sets non scrapés + cible des subseries probes (TG/GG via `lookupSubseries`, last-chance dex probe). Cardmarket pricing inclus. Phase 3a en fait la source unique du cron pricing quotidien.
- **LimitlessTCG** — Source du catalogue local (~52K cartes JP+EN+FR, scraping robots.txt OK). Phase 3c : `parseIllustrator` + `enrichWithIllustrators` (toggle `SCRAPE_ILLUSTRATOR=1`, ~3h pour full re-scrape, resume DB-driven).
- **Gemini 3.1 Flash Lite Preview** — Moteur OCR primaire via `lib/api/gemini-vision.ts` (JSON structuré, 13 champs dont `illustrator`). `thinkingConfig: { thinkingBudget: 0 }` impératif. Google Vision (fallback automatique si Gemini erreur ou parse fail ; `_engine` propagé au front).
- **Scanner UI** — Layout 2 colonnes desktop, loupe magnifier 1.5×, formulaire dense (variant + notes). Snippet OCR montre set_code, set_number, illustrator + ligne tokens engine-aware. Mobile : file picker système (camera + galerie au choix).
- **Tests** — Vitest + happy-dom. Lancer : `npm test`. **279 tests passing.**

## Architecture clé

| Module | Fichiers |
|---|---|
| OCR | `lib/api/gemini-vision.ts` (primaire, `thinkingBudget=0` + `extractJsonObject`), `lib/api/vision.ts` (fallback), `app/api/ocr/route.ts` (normalise `language`, propage `_engine`, ZH→CN) |
| Catalogue local | `lib/api/tcg-catalog.ts` (`lookupByCode`, `lookupByTotal`, `lookupByNameAndLocalId`, `disambiguateByName`, `disambiguateByIllustrator`, `formatBilingualName`, `deriveCardNameFr`), table `tcg_catalog` (~52K cartes JP+EN+FR + colonne `illustrator` Phase 3c) |
| Scraper LimitlessTCG | `scripts/scrape-limitlesstcg.ts` (`MODE=full LANGUAGES=jp,en,fr`, ~12 min sans illustrator ; `SCRAPE_ILLUSTRATOR=1` ~3h avec, resume DB-driven, concurrence 5) |
| Enrichissement | `app/api/enrich/route.ts` — Strategy 1 catalog by code, 2 catalog by total, 2.5 catalog by name+localId (auto-disambig illustrator), 3a TCGdex `lookupSubseries`, 3b `probeSubseriesByDex`, 3 TCGdex live, 5 Gemini-only fallback (KO/CN). `applyGeminiEnrichments` pour noms bilingues. |
| Smart extraction | `lib/utils/extract-from-words.ts` (set_code + set_number depuis bounding boxes Vision) |
| Scanner | `components/submit/CardScanForm.tsx` (réutilisable : standalone via `<SubmitTabs>` ou embarqué dans `<PokedexScanModal>` avec props `lockedPokemonNumber`/`lockedStatus`/`onCancel`/`onSaved`/`compact`) |
| Suggestion | `lib/utils/pokedex-suggestion.ts`, `app/api/pokedex/suggest/route.ts` |
| Pokédex | `components/pokedex/PokedexGrid.tsx`, `PokedexCell.tsx`, `PokedexListItem.tsx`, `PokedexDrawer.tsx` (avec replace + scan inline), `PokedexFilters.tsx` (3 view modes : grid-large/grid-compact/list, persistés via `useSyncExternalStore` + localStorage) |
| Stock | `app/(app)/stock/page.tsx`, `components/stock/{StockList,StockRow,StockFilters}.tsx`, endpoint `app/api/cards/[id]/clone/route.ts` |
| Vinted | `app/(app)/vinted/page.tsx`, `app/api/cards/[id]/route.ts`, `components/vinted/{VintedList,VintedFilters,VintedRow,EditablePriceCell,SoldModal,RestockToast,PromoteAfterSoldModal,AnnonceModal,VintedListedToggle,ExchangeOnConflictModal,SoldRow,ConfirmDialog,CardZoomModal,BulkSelectionBottomBar,BulkSoldModal,BulkSoldRecapModal}.tsx` |
| Pokédex slot promotion | `components/cards/MoveToPokedexModal.tsx` (utilisée Stock+Vinted), `components/cards/PokedexReplaceModal.tsx` (depuis le scan), endpoint `app/api/pokedex/replace/route.ts` (RPC 3-step) |
| Helpers purs (testés) | `lib/utils/{group-cards, vinted-sort, vinted-filter, listing-stale, restock-detection, promote-detection, pokedex-mismatch, pokedex-swap, pokemon-names, image-postprocess, vinted-template, lot-template, parse-set-number, extract-from-words, split-bulk-price, resize-image}.ts` |
| Options | `app/(app)/options/page.tsx` + `components/layout/{ThemeToggle,SignOutButton}.tsx` |
| Migrations | 8 fichiers chronologiques dans `supabase/migrations/` — initial_schema, tcg_catalog, add_cards_variant, phase21_vinted_unique_listed, fix_replace_pokedex_card_3step, lots_vinted_bundle, rename_zh_to_cn, tcg_catalog_illustrator |

## Pipeline d'enrichissement

1. **OCR Gemini 3.1 Flash Lite Preview** → JSON structuré 13 champs : `{ card_name, pokemon_name, set_code, set_number, set_total, language, rarity, confidence, pokemon_number, pokemon_name_fr, set_name, set_name_fr, illustrator }`. Fallback Google Vision si Gemini timeout/erreur/parse-fail. `_engine` propagé au front pour debug.
2. **Strategy 1** : `setCode + setNumber + language` → catalog direct lookup (normalisation `normalizeSetCode`)
3. **Strategy 2** : `total + setNumber + language` → catalog loose (gère JP où denominator imprimé ≠ cardCount officiel) + disambig par nom OCR
4. **Strategy 2.5** : `pokemon_name + setNumber + language` → catalog up to 15 candidats. Si Gemini a fourni `illustrator` → `disambiguateByIllustrator` auto-pick l'unique match. Sinon picker visuel.
5. **Strategy 3a** : `lookupSubseries(setCode, localId, text, lang, pokemonNumber)` — détecte patterns TG/GG/SWSH+/XY+/SM+/SVP+/BW+/HGSS+, probe parent sets en parallèle, désambiguise par dex national.
6. **Strategy 3b** : `probeSubseriesByDex(localId, pokemonNumber, lang)` — last-chance probe TG (swsh9-12) + GG (swsh12.5) en aveugle quand setCode est totalement bidon, match strict par dex.
7. **Strategy 3** : TCGdex live (fuzzy text + direct ID + total-based)
8. **Strategy 5** : Gemini-only fallback — construit un EnrichedCard depuis Gemini quand catalog + TCGdex ratent (KO/CN, Crown Series exotiques). Image vide → fallback PokeAPI sprite. Pricing null.
9. **Strategy 6** : null (caller fallback bare OCR fields)

`applyGeminiEnrichments` reformate `card_name`, `pokemon_name`, `set_name` en `"FR (Original)"` quand non-FR + Gemini a fourni la traduction. Propage `pokemon_number` quand catalog null.

## Conventions

- Strict TypeScript, ESLint + Prettier, Geist (font Google), theme dark par défaut.
- Supabase = source de vérité pour toute la donnée. `localStorage` réservé aux pures préférences UI (`iris.pokedex.viewMode` via `useSyncExternalStore` pour éviter les hydration mismatch).
- App mono-utilisateur. Auth Supabase email/password minimale.
- Matching multi-langues par `set_code + set_number` (universel JP/EN/FR).
- Helpers purs dans `lib/utils/` testés en isolation. Composants UI consomment ces helpers — pas de logique métier dans React.

## Setup local

Lire [docs/setup.md](docs/setup.md) pour la creation des comptes externes (Supabase, Google Vision, Gemini API).

**Gemini API Key** : `GEMINI_API_KEY` requis dans `.env.local`. Activer la facturation sur le projet GCP (Tier 1 quotas : inclus dans free tier si < $0.50/mois).

**Google Vision** : toujours requis comme fallback si Gemini timeout/erreur ou clé manquante.

**Note pour scripts locaux** : si erreur `UNABLE_TO_VERIFY_LEAF_SIGNATURE` lors du scraping LimitlessTCG, lancer `export INSECURE_HTTPS=1` avant le script (contournement temporaire pour certificats strictement valides mais rejetés par Node 22 sur WSL).

## Choses a NE PAS faire

Cf. context.md section 14. Notamment : pas de `next-pwa`, pas d'historique de prix Cardmarket, pas d'offline-first, pas de monitoring externe.

**Cardmarket API** : fermée aux nouvelles applications depuis 2023. Ne pas tenter d'obtenir des tokens OAuth Cardmarket — le catalogue est alimenté par scraping LimitlessTCG (robots.txt OK).

## Compatibilite IA

Voir [AGENTS.md](AGENTS.md) pour les conventions multi-agents.
