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
- **Phase 3c** — TERMINEE. **Volet 1 — Bulk vendu** : mode "Sélection multiple" sur `/vinted` (toggle dans `<VintedFilters>`), checkbox `accent-red` sur chaque ligne for_sale (cartes + lots), `<BulkSelectionBottomBar>` fixed-bottom avec count, `<BulkSoldModal>` (liste items + thumb + total prix + date + preview live splitPrice), `splitPrice` helper en cents-int (dernière carte absorbe le remainder). Sequential PATCH avec capture restock + promote arrays. `<BulkSoldRecapModal>` carousel chevrons + dot indicators + restock alerts inline → `<PromoteAfterSoldModal>` queue chaînée drainée carte-par-carte. Lots respectent maintenant les chips d'état (En ligne / Pas en ligne / À rafraîchir / Vendus) via `passesStateChips` + `shouldHideForSalePile` partagés. Restock alert ne fire plus si copies stock présentes (ajout `remainingStockCount` au détecteur, route fait 3 queries en parallèle). **Volet 2 — Gemini tokens optim** : usageMetadata extracté (promptTokenCount + candidatesTokenCount), cost calculé en EUR (USD_TO_EUR=0.92 fixe), maxOutputTokens=300 cap, prompt 500→220 tokens, **`thinkingConfig: { thinkingBudget: 0 }` critique** pour stopper le fallback Vision systématique (Gemini 3 est un reasoning model qui par défaut bouffe le budget en thoughts avant de produire le JSON), parser tolère prose préamble + markdown fences via `extractJsonObject`. `_usage` propagé serveur → front + `_engine: 'gemini' | 'vision'` field pour debug ligne engine-aware (3 cas : `[Gemini]`, `[Gemini→Vision]` parse-fail, `[Vision]` gemini-down). Resize default 1600→1400px (~−25% image tokens). **Switch modèle** `gemini-3-flash-preview` → `gemini-3.1-flash-lite-preview` après bench multi-modèles 5/5 cartes (5/5 acc, −43% coût, −35% latence). Pricing constants corrigés à $0.25 in / $1.50 out (étaient à Gemini 1.5 Flash $0.075/$0.30 → 7× sous le réel). Coût par scan : ~€0.000420-0.000525 (vs €0.000921 avant). 1 nouveau script `scripts/bench-multi-model.ts` pour bencher d'autres modèles. **253 tests** vitest (+11 vs Phase 3b2 : 6 splitPrice + 1 stock-aware restock + 4 Gemini tolerance/usage), 0 lint warning, 0 type error. Aucune nouvelle migration. Persistence des tokens en DB **non implémentée** (déférée à Phase 5 dashboard). Brief : [PHASE_3.md](PHASE_3.md).
- **Phase 4** — A FAIRE. Passage à 2 users (RLS multi-tenant Supabase) + Import one-shot du profil Vinted existant (parser HTML profil → seed IRIS). Brief : [PHASE_4.md](PHASE_4.md).
- **Phase 5** — A FAIRE. Dashboard (KPIs valeur stock + top cartes rares + alertes restock + tracking tokens consommés et coût/jour) + polish PWA (install prompt, icônes 192/512, manifest fine-tune).

Bilan détaillé : [docs/phases-summary.md](docs/phases-summary.md).

## Stack à connaître

- **Next.js 16** — `proxy.ts` (pas `middleware.ts`), `params` est async, App Router strict, manifest via `app/manifest.ts`.
- **Tailwind v4** — config dans `app/globals.css` via `@theme` (pas de `tailwind.config.ts`).
- **Supabase** — via `@supabase/ssr` (helpers dans `lib/supabase/`).
- **TCGdex** — Fallback API live pour sets non scrapés. Cardmarket pricing inclus (`pricing.cardmarket.{low, trend, avg, updated}`). Phase 3a en fait la source unique du cron pricing quotidien.
- **LimitlessTCG** — Source du catalogue local (111K cartes, scraping robots.txt OK).
- **Gemini 3 Flash Preview** — Moteur OCR primaire via `lib/api/gemini-vision.ts` (JSON structuré + 4 champs FR/pokemon_number depuis training data). Google Vision (fallback si Gemini erreur ou absent).
- **Scanner UI** — Layout 2 colonnes desktop, loupe magnifier 1.5× sur la photo, formulaire dense avec variant + notes. FR auto-translation propagée du scan jusqu'à la persistance.
- **Tests** — Vitest + happy-dom. Lancer : `npm test`.

## Architecture clé

| Module | Fichiers |
|---|---|
| OCR | `lib/api/gemini-vision.ts` (primaire), `lib/api/vision.ts` (fallback), `app/api/ocr/route.ts` |
| Catalogue local | `lib/api/tcg-catalog.ts` (incl. `formatBilingualName` + `deriveCardNameFr`), table `tcg_catalog` (111K cartes) |
| Scraper LimitlessTCG | `scripts/scrape-limitlesstcg.ts` (~12 min, 7 langues, 1163 sets) |
| Enrichissement | `app/api/enrich/route.ts` (catalogue → TCGdex fallback, helper `applyGeminiEnrichments` pour noms bilingues) |
| Smart extraction | `lib/utils/extract-from-words.ts` (set_code + set_number depuis bounding boxes Vision) |
| Scanner | `components/submit/CardScanForm.tsx` (réutilisable : standalone via `<SubmitTabs>` ou embarqué dans `<PokedexScanModal>` avec props `lockedPokemonNumber`/`lockedStatus`/`onCancel`/`onSaved`/`compact`) |
| Suggestion | `lib/utils/pokedex-suggestion.ts`, `app/api/pokedex/suggest/route.ts` |
| Pokédex | `components/pokedex/PokedexGrid.tsx`, `PokedexCell.tsx`, `PokedexListItem.tsx`, `PokedexDrawer.tsx` (avec replace + scan inline), `PokedexFilters.tsx` (3 view modes : grid-large/grid-compact/list, persistés via `useSyncExternalStore` + localStorage) |
| Stock | `app/(app)/stock/page.tsx`, `components/stock/{StockList,StockRow,StockFilters}.tsx`, endpoint `app/api/cards/[id]/clone/route.ts` |
| Vinted | `app/(app)/vinted/page.tsx`, `app/api/cards/[id]/route.ts`, `components/vinted/{VintedList,VintedFilters,VintedRow,EditablePriceCell,SoldModal,RestockToast,PromoteAfterSoldModal,AnnonceModal,VintedListedToggle,ExchangeOnConflictModal,SoldRow,ConfirmDialog,CardZoomModal}.tsx` |
| Pokédex slot promotion | `components/cards/MoveToPokedexModal.tsx` (utilisée Stock+Vinted), `components/cards/PokedexReplaceModal.tsx` (depuis le scan), endpoint `app/api/pokedex/replace/route.ts` (RPC 3-step) |
| Helpers purs (testés) | `lib/utils/{group-cards, vinted-sort, vinted-filter, listing-stale, restock-detection, promote-detection, pokedex-mismatch, pokedex-swap, pokemon-names, image-postprocess, vinted-template, parse-set-number, extract-from-words}.ts` |
| Options | `app/(app)/options/page.tsx` + `components/layout/{ThemeToggle,SignOutButton}.tsx` |
| Migrations | `supabase/migrations/20260425224142_initial_schema.sql`, `20260428114538_tcg_catalog.sql`, `20260429142350_add_cards_variant.sql`, `20260430130000_phase21_vinted_unique_listed.sql`, `20260430200000_fix_replace_pokedex_card_3step.sql`, `20260502120000_lots_vinted_bundle.sql` |

## Pipeline d'enrichissement

1. OCR (Gemini 3 Flash Preview) → JSON structuré `{ card_name, set_code, set_number, language, confidence, pokemon_number, pokemon_name_fr, set_name, set_name_fr }`. Fallback Google Vision si Gemini timeout/erreur/clé absente (sans champs FR).
2. Enrich Strategy 1 : `setCode + setNumber` → lookup direct table `tcg_catalog` (normalisation SM-P/XY-P via `normalizeSetCode`)
3. Enrich Strategy 2 : `total + setNumber` → lookup loose dans `tcg_catalog` (gère JP où denominator imprimé != cardCount officiel) + disambiguation par nom OCR
4. Enrich Strategy 3 : TCGdex live fallback (nouveaux sets pas encore dans le catalogue)
5. Strategy 4 : null (OCR extractions conservées pour pré-remplir le form, user complète à la main)
6. Avant de retourner, `applyGeminiEnrichments` reformate `card_name`, `pokemon_name`, `set_name` en `"FR (Original)"` quand Gemini a fourni une traduction et que la langue n'est pas FR. Propage `pokemon_number` quand le catalogue ne l'a pas.

**Disambiguation par nom** : si le nom du Pokémon dans l'OCR match un seul candidat → auto-select. Sinon → picker visuel.

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
