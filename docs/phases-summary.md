# Phase 1 — Bilan

## Ce qui est livré

### 1.1 Setup initial
- Next.js 16, TypeScript strict, Tailwind v4, ESLint, Prettier
- `.env.example` avec tous les placeholders

### 1.2 Documentation setup
- `docs/setup.md` : guide complet (Supabase, Google Vision, env vars)

### 1.3 Base de données
- Migration `supabase/migrations/20260425224142_initial_schema.sql`
- 4 enums (`card_language`, `card_condition`, `card_status`, `card_rarity`)
- 4 tables (`rarity_ranks`, `lots`, `cards`, `config`)
- Index partiel unique `one_pokedex_per_pokemon`
- Trigger `cards_set_rarity_rank`
- RPC `replace_pokedex_card` (swap atomique)
- Buckets Storage `card-photos` et `lot-photos` avec RLS

### 1.4 Auth
- Login email/password Supabase (`app/(auth)/login/`)
- `proxy.ts` : protection de toutes les routes sauf `/login` et `/api/prices/update`
- Helpers `lib/supabase/server.ts`, `client.ts`, `proxy.ts`

### 1.5 Layout & navigation
- Sidebar desktop 220px + bottom nav mobile 4 onglets
- Theme dark par defaut + toggle cookie-based
- Design tokens dans `app/globals.css` (`@theme`)

### 1.6 OCR + Enrichissement
- Google Vision `DOCUMENT_TEXT_DETECTION` + `languageHints: ['ja', 'en']`
- Smart extraction via bounding boxes : `findSetNumberCandidate` + `findSetCodeCandidate`
- Enrichissement multi-strategie :
  1. `setCode + localId` → lookup direct TCGdex
  2. `total + localId` → scan loose des sets (gere JP denominator != official)
  3. Fallback pokemontcg.io (EN)
- Disambiguation par nom OCR : auto-select si 1 match, picker si plusieurs, tous affichés si aucun match
- TCGdex : 170 sets JP, Cardmarket pricing inclus gratuitement

### 1.7 Scan mobile
- `components/submit/MobileSubmit.tsx` : photo → OCR → enrich → form pre-rempli → save
- Candidate picker visuel (grille avec images TCGdex) quand plusieurs cartes correspondent
- Bouton "Re-rechercher TCG" pour relancer manuellement
- Upload photo dans Supabase Storage
- Pricing Cardmarket pre-rempli quand disponible

### 1.8 Suggestion Pokedex
- `lib/utils/pokedex-suggestion.ts` : 4 outcomes (`no_pokemon_number`, `no_entry`, `can_replace`, `keep_existing`)
- `components/cards/ScanSuggestion.tsx` : bandeau visuel dans le form
- `app/api/pokedex/replace/route.ts` : swap atomique via RPC SQL

### 1.9 Grille Pokedex
- 1025 cellules responsive avec lazy loading
- Filtres : generation, statut (complet/manquant), recherche
- Sprites PokeAPI
- Drawer avec photo + image TCG + bouton Remplacer

### 1.10 Tests
- 52 tests, 6 fichiers, 0 warnings lint
- `lib/utils/pokedex-suggestion.test.ts` — 4 cas de suggestion
- `lib/utils/extract-from-words.test.ts` — extraction set_code/set_number, rejection Miyanose/x2
- `lib/api/tcgdex.test.ts` — mapping rarete, extraction nom, toEnrichedCard, pricing
- `lib/api/tcgapi.test.ts` — parsing set_number, recherche
- `lib/utils/parse-set-number.test.ts` — regex `<card>/<total>`
- `lib/utils/sanity.test.ts` — imports et types

### 1.11 Catalogue local Pokémon TCG

**Contexte** : Le pipeline d'enrichissement (post-OCR) plafonnait à **10/30 (33%)** sur le test bench. L'investigation révélait que TCGdex JP ne cataloguait pas les sets antérieurs à SV-era (BW, XY, SM) — metadata listée mais `cards: []` vide. Aucune optimisation OCR ne pouvait dépasser ce plafond : le problème résidait côté source de données.

**Pivot Cardmarket → LimitlessTCG** : Le plan initial visait l'API Cardmarket comme catalogue. Découverte en cours de route : **Cardmarket a fermé son API aux nouvelles applications** (déclaration officielle 2023). Nettoyage du code OAuth mort + pivot vers scraping **LimitlessTCG** (limitlesstcg.com). Leur robots.txt est entièrement ouvert et ils exposent des vues HTML propres par-set, facilement parsables.

**Livrables** :
- Migration `supabase/migrations/20260428114538_tcg_catalog.sql` — table `tcg_catalog` (schéma : `id`, `set_code`, `set_number`, `set_total`, `language`, `card_name`, `pokemon_name`, `pokemon_number`, `set_name`, `rarity`, `image_url`, `scraped_at`)
- `scripts/scrape-limitlesstcg.ts` — crawl 7 langues × ~150 sets = 1163 sets en ~12 minutes
- **111,396 cartes** peuplées (JP, EN, FR, DE, IT, ES, PT). KO/ZH absents de LimitlessTCG.
- `app/api/enrich/route.ts` — 4 strategies : catalogue direct, catalogue by-total + disambiguation nom, TCGdex live fallback, null
- `lib/api/tcg-catalog.ts` — helpers lookup (`lookupByCode`, `lookupByTotal`, `disambiguateByName`) + `normalizeSetNumber` (gère leading-zero OCR quirk) + loose total matching (denominator imprimé JP != cardCount officiel)
- `lib/api/tcgapi.ts` (pokemontcg.io fallback) — SUPPRIME, couvert par le catalogue
- 81 tests (nouveaux : `lib/api/tcg-catalog.test.ts` 19 tests), lint + tsc verts

**Test bench progression** :
- Baseline : 10/30 (33%)
- Post-catalogue : **17/30 enrichies correctement** (56%)
- +3 cartes techniquement correctes mais avec nomenclature set-variant différente (sv3 au lieu de sv3a) → **20/30 effectif (67%)**
- +6 échecs purement OCR (pas de set_code/set_number extrait)
- +2 bugs catalogue réels (déférés) : `xy_087` (ギルガルドEX XY-era, pas de match évident) + variants sv3a/sv3b non couverts par fuzzy sv3

**Résultat net** : **19/30 mesurés (63%), ~22/30 effectifs (73%)** en comptant les variantes de nom acceptables.

**Followups déférés (non-bloquants)** :
1. Index redondant `tcg_catalog_lookup_idx` (overlap avec contrainte unique implicite) — à supprimer
2. Backfill `cardmarket_id` (actuellement vide pour rows scrapées LimitlessTCG)
3. Améliorer mapping rarity (Triple Rare, Radiant Rare, Item/Supporter/Energy atterrissent dans colonne rarity)
4. Détection variants (sv3 → aussi tenter sv3a/sv3b quand fuzzy touche le parent)
5. Investiguer `xy_087` (pas de match catalogue pour ギルガルドEX dans XY-era JP)

## Problemes resolus en cours de route

| Probleme | Cause | Solution |
|---|---|---|
| Timeout Vision API | Node 18 (apt) + undici bug | Pin Node 22 via `.nvmrc` |
| Confiance OCR 0% | `TEXT_DETECTION` ne renvoie pas `confidence` | `DOCUMENT_TEXT_DETECTION` + block-average fallback |
| Pas de cartes JP | pokemontcg.io n'indexe pas les sets JP | Integration TCGdex (131 sets JP, gratuit) |
| "Miyanose" comme set_code | Regex acceptait les mots tout-lettres | Exiger lettres + chiffres dans `looksLikeSetCode` |
| "x2" comme set_code | Regex acceptait 2 caracteres | Minimum 3 caracteres |
| Region filter cassait les crops | Hard filter y>0.80 rejetait les footer-only crops | `footerScore()` comme tie-breaker, pas de filtre dur |
| Form vide apres scan JP | `cardCount.official` (174) != denominateur imprime (086) | Loose matching : `official >= localId`, sets recents d'abord |
| Mauvaise carte auto-selectionnee | 10 sets ont une carte #111 | Disambiguation par nom OCR + picker visuel |

### 1.12 Gemini vision OCR

**Contexte** : Le pipeline d'enrichissement post-catalogue atteignait **19/30 mesurés (63%)**, limité non par les données mais par la couche OCR. Google Vision + extraction regex extraite seulement **set_code + set_number** (pas de nom de carte), ce qui laisse 6 cartes non-matchables (Vision ne capturait pas le texte key, ou regex était trop stricte sur la nomenclature variant SM-P/XY-P/sv11W).

**Objectif** : Améliorer OCR de 63% → 93%+ en utilisant une LLM structurée (Gemini Flash Preview) pour extraire directement JSON avec `card_name`, `set_code`, `set_number`, `language`, `confidence`.

**Résultat** :
| Modèle | Match combiné | Cost/scan | 100/mois |
| --- | --- | --- | --- |
| **gemini-3-flash-preview** | **28/30 (93%)** | $0.0006 | **6¢** |
| gemini-flash-latest (alias) | 28/30 (93%) | $0.0006 | 6¢ |
| gemini-2.5-pro | 19/30 (63%) | $0.0023 | 23¢ |
| gemini-2.5-flash | 13/30 (43%) | $0.0006 | 6¢ |
| gemini-2.5-flash-lite | 12/30 (40%) | $0.0001 | 1¢ |
| Claude Haiku 4.5 | 0/30 | — | — |
| Vision + catalogue (baseline) | 19/30 (63%) | $0 | $0 |

Nota : "Match combiné" = extraction correcte (set_code + set_number valides), testé sur 30 cartes de bench OCR réels. Les 2 cartes manquantes avec Gemini sont des cas extrêmes de qualité image mauvaise (blurred, angle, reflet) ; fallback Vision également échoue sur ceux-ci.

**Livrables** :
- `lib/api/gemini-vision.ts` — wrapper fetch-based pour `models/gemini-3-flash-preview`, 15s timeout, retourne `null` en cas d'erreur (simul fallback silencieux)
- `app/api/ocr/route.ts` — chaîne : Gemini d'abord → fallback Google Vision si Gemini erreur/timeout/clé absente
- `lib/api/tcg-catalog.ts` — ajout `normalizeSetCode(code: string)` (gère SM-P → SM, XY-P → XY, sv11W → sv11) + `lookupByCode` strict-first (index unique) puis loose (normalization JS)
- Tests : `lib/api/gemini-vision.test.ts` (wrap, timeout, fallback), `lib/api/tcg-catalog.test.ts` (+8 tests sur normalizeSetCode)
- Benchmark : `scripts/bench-ocr-models.ts` (Gemini, Vision, Claude testés en parallèle)
- 97 tests pass (81 phase 1.11 + 16 nouveaux), lint + tsc clean

**Architecture OCR simplifié** :
1. POST `/api/ocr` avec `image: File`
2. Gemini parse → JSON `{ card_name, set_code, set_number, language, confidence }`
3. Si erreur Gemini : Google Vision textDetection → extraction regex legacy `[set_code + set_number]`
4. Frontend reçoit toujours `OcrResult { card_name?, set_code?, set_number?, language?, confidence? }`

**Cost model** :
- Gemini 3 Flash : Input $0.075/1M tokens, Output $0.03/1M tokens
- ~200 input tokens (image + system prompt), ~50 output tokens (JSON) par scan
- Cost/scan ≈ $0.0006 (+ 15ms latency p95)
- 100 scans/mois ≈ 6¢, bien dans free tier GCP (même avec facturation activée)

**Considerations** :
- Gemini 3 Flash est un modèle **preview**. Google pourrait le retirer ou le versionner (`gemini-flash-latest` alias actuel).
- Rate limits Tier 1 : 15 req/min. Acceptable pour usage mono-utilisateur, mais à monitorer si multi-users.
- Fallback Google Vision préservé pour robustesse ; contrairement à Phase 1, Vision n'est plus utilisé "en prod" par défaut mais reste disponible.
- Aucune dépendance Anthropic Claude API — pure GCP Gemini.

**Open followups** :
1. Monitoring changement modèle Gemini (alert si preview retire/versionne)
2. Fallback chain plus robuste (retry Gemini N fois avant Vision)
3. Log OpenTelemetry du temps latence Gemini (p50/p95)
4. A/B test : Gemini vs Vision sur users réels (prod)

### 1.13 Translations FR + UX polish

**Contexte** : Le pipeline OCR + enrichissement fonctionne (93% bench), mais l'UX reste rugueuse :
- Les noms japonais (`チャオブー`) sont illisibles pour le user, qui doit chercher la traduction à la main avant de générer une annonce Vinted.
- Le formulaire scanner a un layout vertical qui force du scroll sur desktop ; l'image preview est trop petite pour zoomer sur la rareté/illustrateur.
- La grille Pokédex à 1025 cellules est compacte mais inadaptée à la lecture détaillée d'une carte précise (rareté + prix).
- La table `cards` n'a pas de colonne pour distinguer les variantes (Poké Ball / Master Ball / Reverse Holo / Promo) qui valent souvent 1.5-2× le standard sur Vinted.
- Bug : le fix Gemini `pokemon_number` flow ne descendait pas jusqu'au formulaire (`pokemon_number` resté vide).

**Livrables** :
- **Gemini OCR enrichi** (commit `dabaff2`) : `lib/api/gemini-vision.ts` retourne 4 nouveaux champs depuis le training data du modèle — `pokemon_number` (national dex 1-1025), `pokemon_name_fr` (`"Gruikui"` pour `チャオブー`), `set_name`, `set_name_fr` (`"Combat de Maîtres"` pour `ホワイトフレア`). Le prompt liste explicitement ces champs et leur fallback `null`.
- **Reformatage bilingue** (commit `87370f2`) : `lib/api/tcg-catalog.ts` exporte `formatBilingualName(original, frenchName, language)` (`"Gruikui (チャオブー)"`) + `deriveCardNameFr` (extrait suffixe `ex`/`EX`/`V`/`VMAX`/`VSTAR`/`GX`/`BREAK`/`LEGEND` du nom original et le concatène au nom FR du Pokémon). `app/api/enrich/route.ts` applique `applyGeminiEnrichments` sur tous les hits catalogue.
- **Renommage UX** (commit `e964369`) : "TCG match" → "Match catalogue" dans le bandeau de scan ; vérification du wiring Pokédex auto-suggestion.
- **Scanner UI 2-col + loupe** (commits `6c6d043`, `bc16bc3`) : layout 2 colonnes desktop (photo+loupe sticky à gauche, formulaire à droite), grille interne du form plus dense (Pokémon # + nom Pokémon + nom carte sur 3 colonnes), loupe magnifier 1.5× sur hover de l'image (clamp pour rester dans les bounds). Re-rechercher passe les champs OCR Gemini (commit `6ae7351`) pour préserver les FR translations entre essais.
- **Pokédex view modes** (commits `3eda84c`, `86b9376`, `7cf9443`) : 3 modes — `grid-3` (3-6 cols, large), `grid-5` (5-10 cols, compact), `list` (sprite + nom + carte + rareté + prix). Préférence persistée dans `localStorage` (`iris.pokedex.viewMode`). Nouveau composant `PokedexListItem.tsx` (97 lignes). Toggle avec icônes Lucide (`Grid3x3`, `Grid2x2`, `List`) + labels visibles ≥ sm.
- **Variant dropdown** (commit `e155a50`) : nouvelle migration `20260429142350_add_cards_variant.sql` (colonne `variant text` sur `cards`, NULL = standard). `MobileSubmit.tsx` propose Standard / Poké Ball / Master Ball / Reverse Holo / Promo. `app/api/cards/route.ts` accepte `notes` et `variant` dans le POST.
- 116 tests (+19 vs Phase 1.12), 0 lint warning, tsc clean.

**Note de validation** : pas encore testé end-to-end en conditions réelles (vraies sessions de scan utilisateur). Les tests unitaires couvrent les helpers (formatBilingualName, deriveCardNameFr, mapping Gemini), mais aucun test E2E sur les view modes / variant dropdown / loupe.

**Followups différés** :
1. Pricing Cardmarket par variant — le scraper LimitlessTCG ne distingue pas Poké Ball / standard ; Phase 3 devra splitter cette donnée pour calculer un suggested_price correct.
2. Dashboard Vinted (Phase 4) avec filtres par variant et par rareté.
3. Bug latent : si Gemini retourne `pokemon_number` mais le catalogue retourne une carte avec un `pokemon_number` différent (cas rare des cartes Trainers avec un Pokémon en illustration), le catalogue gagne. À investiguer si on voit des mismatches en prod.
4. Tests E2E (Playwright) sur les view modes Pokédex et le flow scan complet.

### Phase 2 — Module Vinted

**Contexte** : Phase 1 livrait l'ingestion (scan → enrichissement → save) ; Phase 2 ferme la boucle vente : voir le stock, marquer vendu, générer une annonce prête à coller.

**Livrables** :
- `lib/utils/group-cards.ts` — clé de groupement variant-aware (`card_id_tcg + language + condition + variant`, fallback composite si `card_id_tcg` null) + tri FIFO inter/intra-groupe + position globale.
- `lib/utils/restock-detection.ts` — pure : détecte si une vente expose la carte Pokédex (pokedex existe AND aucune for_sale restante).
- `lib/utils/vinted-template.ts` — `buildTitle` (smart-truncate ≤ 80 chars, ordre : full → drop bilingual paren → drop NM → set_name → set_code → drop set, fallback last-resort qui préserve le suffixe TCG type "ex"/"VMAX") + `buildDescription` multi-langues + tables de constants (langues, conditions, raretés, variants).
- `app/api/cards/[id]/route.ts` — PATCH générique (édit prix, marquage vendu) + check restock server-side après vente. Validation stricte : `status='pokedex'` rejeté (utiliser `/api/pokedex/replace`), nombres positifs/finis, 404 sur PGRST116.
- `app/(app)/vinted/page.tsx` — RSC fetch (for_sale + pokedex registered + config en parallèle, erreurs surfacées sur les 3 queries).
- `components/vinted/` — `VintedList` (orchestrateur, state local + filtres + groupement + modals), `VintedFilters` (search debounce-free + 4 filtres : langue / rareté / variant / registered), `VintedRow` (layout : position FIFO, thumb fallback PokeAPI, variant chip, badges rareté semantic, registered indicator vers `/pokedex`), `EditablePriceCell` (édit inline, comma→dot, Escape revert, Enter commit, PATCH `suggested_price`), `SoldModal` (prix + date optionnels, gère ISO timezone-safe `T12:00:00Z`), `RestockToast` (5s auto-dismiss, role="alert", lien `/pokedex`), `AnnonceModal` (titre éditable + char counter live, description éditable, copie clipboard avec feedback `Copié ✓` 1.5s, prix Vinted persisté à la fermeture).
- Tests : +21 unitaires (group-cards 7, restock-detection 4, vinted-template 11, route /api/cards/[id] 6 minus déduplication) → **144 tests** (vs 116 fin Phase 1.13). Lint 0 warning, tsc clean, build prod OK.

**Décisions clés** :
- Variant inclus dans la clé de groupement (Poké Ball ≠ standard côté valeur Vinted).
- Prix éditable inline en attendant le cron Cardmarket Phase 3.
- Restock = toast éphémère (la persistance dashboard est Phase 4).
- Modal pour vendu et annonce, pas de drawer ni de page dédiée.
- Tokens Tailwind sémantiques (`text-rarity-sr`, `bg-rarity-r/20`, etc.) au lieu des défauts (`text-yellow-400`) — cohérent avec les composants Pokédex.
- Validation côté serveur : `status='pokedex'` interdit dans PATCH (passe par RPC swap atomique).

**Followups différés** :
1. Auto-ouverture du PokedexDrawer au clic sur badge Registered (actuellement : lien vers `/pokedex` sans anchor).
2. Tests E2E Playwright sur le flow complet (déféré, cohérent avec note Phase 1.13).
3. Pricing variant-aware quand le scraper LimitlessTCG splittera la donnée (Phase 3).
4. Cron Cardmarket → Phase 3.
5. Bulk vendu + dashboard KPIs → Phase 4.
6. Polish UX : feedback toast sur erreur clipboard ou PATCH (actuellement silencieux + console.error), Escape pour fermer les modals, click overlay pour fermer.
7. Position du `<RestockToast>` (`bottom-6 right-6`) peut chevaucher la `BottomNav` mobile — vérifier sur device et déplacer si besoin.

### Phase 2.1 — Restructuration Stock/Vinted + UX deep-clean

**Contexte** : Le smoke-test de la Phase 2 a remonté un paquet de manques structurels et UX. Le modèle "1 carte = 1 ligne FIFO" était trop pauvre : il manquait la distinction Stock (collection perso pas en vente) vs Vinted (en vente, certaines déjà en ligne sur le marketplace, d'autres en attente d'upload). Le scanner forçait un flow séquentiel rigide. La grille Pokédex affichait `???` pour les manquants (impossible de chercher par nom). L'unique constraint pokédex faisait crasher l'enregistrement au lieu d'ouvrir une modale de remplacement.

Cette itération corrige tout ça en une vague cohérente, plus du polish UX accumulé sur ~3 semaines de tests utilisateur réels.

**Décisions architecturales clés** :
- **Stock = nouvelle page `/stock`** (status='collection', cartes pas destinées à la vente immédiate). Vinted reste `/vinted` (status='for_sale', avec sous-statut "publié sur Vinted.com" via colonne `vinted_listed_at`). Nav 6 onglets : Home / Scanner / Pokédex / Stock / Vinted / Options.
- **Filtres Vinted = chips mutuellement exclusifs** (Pas en ligne / À rafraîchir / En ligne / Vendus). Chaque chip = 1 bucket. Combinaisons = unions. Sort en 3 buckets : offline (date_added ASC) → stale (vinted_listed_at ASC) → fresh (vinted_listed_at DESC). Sold en queue séparée (date_sold DESC).
- **Toggle "en ligne" 3 états** sur chaque row Vinted : offline (orange) / online (vert) / stale (sarcelle, >21j). Click :
    - offline → online instant (date = now)
    - online → confirm dialog → offline (perd la date)
    - stale → confirm dialog → fresh (date = now, sort de "À rafraîchir")
  Labels intègrent le compteur "X j" (ex: "En ligne · 5j"). PATCH `vinted_listed_at` côté API.
- **Hard block scanner Pokédex** : quand le drawer Pokédex est ouvert sur le slot #N et qu'on scanne une carte de Pokémon ≠ #N, le bouton Save est désactivé et un message ⛔ explicite. Comparaison sur le `pokemon_number` réellement détecté par Gemini, pas sur le nom (plus fiable).
- **Stock = miroir de Vinted** : groupement variant-aware identique, badge Pokédex/Pas Pokédex à côté de la condition, bouton "Mettre en vente" right-aligned, compteur ×N éditable inline (input number ; submit blur ou Enter → diff vs count actuel → clones ou deletes parallèles).
- **Image bypass anti-bot Vinted** : bouton "Download img" dans AnnonceModal qui post-process l'image dans le browser via canvas (random crop 2-5px + JPEG quality 88-92 + filename randomisé + EXIF strippé naturellement). Pas de round-trip serveur.
- **PiP mobile dans AnnonceModal** : sur mobile, `image_url` (ma photo) en grand + `tcg_image_url` en thumbnail bas-droite. Click sur la thumb → swap atomique des positions. Sur desktop on reste en 2-up côte à côte avec MagnifierLoupe.
- **MoveToPokedexModal partagée** : clic sur le badge "Pas Pokédex" depuis Stock ou Vinted → modal "Ajouter au Pokédex ?". Si slot occupé, sub-flow demande où envoyer la carte déplacée (Stock ou Vinted). Backend via PATCH `status='pokedex'` (avec pré-check) ou `/api/pokedex/replace` (RPC swap).
- **RPC `replace_pokedex_card` corrigée en 3-step** : park `old`→collection → promote `new`→pokedex (libère le slot for_sale si applicable) → restore `old`→target. Évite la collision unicité quand on swap A (pokedex) ↔ B (for_sale même groupe) avec A → for_sale.

**Migrations DB** :
- `20260430130000_phase21_vinted_unique_listed.sql` : index partiel unique `one_for_sale_per_group` sur `(coalesce(card_id_tcg, ''), language, condition, coalesce(variant, 'standard')) WHERE status='for_sale'`. Colonne `vinted_listed_at timestamptz` + index pour le tri.
- `20260430200000_fix_replace_pokedex_card_3step.sql` : `CREATE OR REPLACE FUNCTION replace_pokedex_card` en 3-step.

**Nouveaux helpers purs (tous testés)** :
- `lib/utils/listing-stale.ts` — `isListingStale(vinted_listed_at, now)`, `daysSinceListing(...)`. Source unique pour le seuil 21j (toggle + filtre).
- `lib/utils/vinted-filter.ts` — `passesStateChips(card, chips, now)` avec sémantique mutuellement exclusive + `shouldHideForSalePile(chips)`.
- `lib/utils/vinted-sort.ts` — sort 3 buckets (réécrit).
- `lib/utils/pokedex-mismatch.ts` — `detectNumberMismatch({ lockedPokemonNumber, detectedPokemonNumber })`.
- `lib/utils/pokedex-swap.ts` — `applyReplacePokedex(...)` modélise l'algo 3-step (pour tester sans Postgres).
- `lib/utils/pokemon-names.ts` — dataset 1025 Pokémon FR+EN (généré une fois via `scripts/fetch-pokemon-names.ts`) + `getPokemonName(n, lang)` helper.
- `lib/utils/image-postprocess.ts` — `processImageForVinted(srcUrl)` (canvas-based) + `downloadBlob(blob, filename)`.
- `lib/utils/promote-detection.ts` — détecte un Stock candidate à promouvoir après vente.

**Nouveaux composants** :
- `components/submit/CardScanForm.tsx` (extrait de l'ancien `MobileSubmit`) — composant scanner réutilisable. Props : `lockedPokemonNumber`, `lockedStatus`, `onSaved`, `onCancel`, `compact` (1-col + photo réduite à 14×14rem).
- `components/pokedex/PokedexScanModal.tsx` — wrapper modal pour scanner inline depuis le drawer Pokédex.
- `components/cards/PokedexReplaceModal.tsx` — modal post-scan quand le slot Pokédex est déjà pris (depuis le scanner standalone).
- `components/cards/MoveToPokedexModal.tsx` — modal partagée Stock+Vinted déclenchée en cliquant "Pas Pokédex".
- `components/vinted/VintedListedToggle.tsx` — toggle 3 états avec confirm dialogs.
- `components/vinted/PromoteAfterSoldModal.tsx` — proposée après vente quand un Stock copy existe.
- `components/vinted/ExchangeOnConflictModal.tsx` — flow 2-step swap quand on tente de mettre en vente une carte dont le for_sale slot est occupé.
- `components/vinted/CardZoomModal.tsx` + `components/ui/MagnifierLoupe.tsx` — extraction réutilisable du zoom + loupe.
- `components/vinted/ConfirmDialog.tsx` — petit primitif confirm avec danger tone.
- `components/vinted/SoldRow.tsx` — row spécifique pour la liste des Vendus.
- `components/stock/{StockList,StockRow,StockFilters}.tsx` — page Stock complète.
- `app/(app)/options/page.tsx` + `components/layout/ThemeToggle.tsx` (refondu en 2 boutons côte à côte) — page Options pour les préférences globales.

**Nouveaux endpoints** :
- `POST /api/cards/[id]/clone` — duplique une carte Stock (copie infos + image_url, reset date_added/listed/sold). Permet la gestion ×N depuis l'UI sans rescan.

**API mises à jour** :
- `PATCH /api/cards/[id]` — accepte maintenant `status='pokedex'` avec pré-check du slot (409 propre si occupé). Pré-check for_sale conflict élargi pour renvoyer `conflictCard` complet (image + meta). Catch des violations 23505 distingue maintenant pokedex vs for_sale.
- `POST /api/cards` — pré-check pokédex slot taken (renvoie `existingCard` + `hasForSaleConflict`). Catch 23505 → 409 friendly.
- `POST /api/pokedex/replace` — capture les violations 23505 résiduelles (3e exemplaire conflictuel).

**Seed script** (`scripts/seed/seed.ts`) :
- Wipe + seed depuis `cards_assets/` (~30 cartes JP scannées). Distribution : 2 sold, 5 pokedex, 5 collection, 3 for_sale stale (vinted_listed_at 25-34j), 3 for_sale fresh online, ~12 for_sale offline. Garantit que tous les flows UI ont des données représentatives.

**Bugs corrigés en route** :
| Symptôme | Cause | Fix |
|---|---|---|
| `?` au lieu du nom Pokédex pour les manquants | Cell/List rendaient `card?.pokemon_name ?? '???'` | Fallback `getPokemonName(n, 'fr')` depuis le dataset 1025 noms |
| Search Pokédex `12` matchait #12, #121, #125 | `String(n).includes(search)` substring | Parse exact : `parseInt(s.replace(/^#?0*/, ''))` |
| Search `0003` ne matchait jamais | Parsing leading-zero | Même normalisation que ci-dessus |
| Hydration mismatch sur `viewMode` localStorage | `useState` initialisé via `localStorage.getItem` au render | `useSyncExternalStore` avec `getServerSnapshot` retournant le default |
| Hard block pokemon_number ne marchait pas | Le code overridait `form.pokemon_number` à `lockedPokemonNumber` au prefill, masquant le mismatch | State `detectedPokemonNumber` séparé, capturé depuis `enrich.bestMatch.pokemon_number` ou `ocr.pokemonNumber` |
| Filtre "À rafraîchir" toujours vide malgré seed | `isStale` lisait `cm_updated_at ?? date_added`, alignement faux avec le toggle | Helper partagé `isListingStale` basé sur `vinted_listed_at` |
| Promote duplicate key sur swap pokedex↔for_sale | RPC 2-step faisait `UPDATE old for_sale` AVANT que `new` n'ait quitté for_sale | RPC 3-step : park → swap → restore |
| Bouton Annuler dans le scanner modal réinitialisait au lieu de fermer | `reset()` toujours appelé | Prop `onCancel` optionnelle qui prend le pas |
| Seed bulk insert silent fail | Plusieurs cards avec `card_id_tcg=null` collisionnaient sur l'index partiel for_sale | Fallback `card_id_tcg = \`seed-${setCode}-${setNumber}\`` |

**Tests : 199/199**, 0 lint warning, 0 type error.

Décompte des nouveaux tests (≥55 ajoutés depuis Phase 2) : `vinted-filter` (12), `vinted-sort` (8 réécrits), `listing-stale` (8), `pokedex-mismatch` (4), `pokedex-swap` (7), `pokemon-names` (2), `image-postprocess` (4), `promote-detection` (3), `route /api/cards/[id]` PATCH pokedex (+1).

**Followups différés** :
1. **Pricing variant-aware** quand le scraper LimitlessTCG splittera (Phase 3). Aujourd'hui `suggested_price` est saisi à la main.
2. Bulk listing (sélectionner plusieurs Stock cards et les promote en for_sale d'un coup) → Phase 4.
3. Cron Cardmarket / source de prix → Phase 3 (l'API Cardmarket reste fermée — 2 stratégies envisagées : scraper Cardmarket public ou réutiliser le pricing TCGdex déjà inclus dans le catalogue).
4. Tests E2E Playwright sur les flows critiques (toujours déféré depuis 1.13).
5. Pré-compute `has_for_sale` côté DB (vue matérialisée ou trigger) si la perf de la page Stock devient un souci avec 10k+ cartes.
6. Image bypass plus agressif (rotation 0.3°, noise) si Vinted détecte encore les uploads.

### Phase 3a — Cron pricing TCGdex

**Contexte** : À la sortie de Phase 2.1, le pricing des cartes `for_sale` est renseigné une fois au scan via TCGdex puis JAMAIS rafraîchi. L'utilisateur édite manuellement. Pas de signal visuel de fraîcheur. L'API Cardmarket étant fermée aux nouvelles applications, on utilise TCGdex (qui expose déjà `pricing.cardmarket.{low,trend,avg,updated}`).

**Livrables** :
- `POST /api/prices/update` — endpoint dual-mode :
  - Bulk : header `Authorization: Bearer ${CRON_SECRET}`, lit jusqu'à 200 cartes `for_sale` (oldest first via `cm_updated_at ASC NULLS FIRST`), parallélisme 10, écrit `cm_price_*` + `cm_updated_at` + backfill `card_id_tcg`
  - Single-card : `?card_id=X` derrière auth Supabase normale, retourne le row mis à jour
- `vercel.json` — cron schedule `0 2 * * *` UTC
- 2 helpers purs : `lib/utils/categorize-pricing-card.ts` (skip variant ≠ null, skip langues KO/ZH non TCGdex, backfill auto si `card_id_tcg` null), `lib/utils/format-staleness.ts` (4 tons : fresh < 24h, stale 1-7j, old > 7j, never null)
- 2 composants UI : `<PriceFreshnessBadge>` + `<RefreshPriceButton>` intégrés dans `VintedRow` / `StockRow` / `PokedexDrawer`. Drawer : label "Annonce" pour `suggested_price` (renommé), refresh + badge à droite de la cellule.
- **Décision clé** : le cron ne touche JAMAIS `suggested_price`. Cette colonne devient "Annonce" en UI, valeur 100% user-définie via `EditablePriceCell`. Le cron écrit uniquement `cm_price_low/trend/avg` + `cm_updated_at` + backfill `card_id_tcg`/`cardmarket_id` si applicable.
- 218 tests, 0 lint warning, 0 type error. Aucune nouvelle migration (toutes colonnes existaient depuis Phase 1).

**Followups différés** :
1. Variant-aware pricing si TCGdex finit par exposer les prix Poké Ball / Reverse Holo / Promo séparément.
2. Monitoring si `gemini-3-flash-preview` (modèle preview) est retiré ou versionné par Google.
3. Tests E2E Playwright sur le flow refresh + cron (toujours déféré depuis 1.13).

### Phase 3b1 — Lots Vinted (bundles)

**Contexte** : Le plan initial visait un "Mode lot ≤ 20 photos individuelles avec OCR par carte". Test utilisateur révèle que c'est chronophage ET inadapté à l'usage réel : les lots sont vendus en bloc, jamais en pièces détachées, jamais ajoutés au Pokédex. Pivot vers "lot = entité distincte de cards".

**Livrables** :
- Migration `supabase/migrations/20260502120000_lots_vinted_bundle.sql` — étend la table `lots` (initialement 3 colonnes vides) avec 11 nouvelles colonnes : `name`, `language`, `condition`, `extra_description`, `price`, `status` (`for_sale`|`sold`), `date_sold`, `sold_price`, `vinted_listed_at`, `photo_urls jsonb`, `date_added`. Indexes : `idx_lots_status`, `idx_lots_date_added`, `idx_lots_vinted_listed`.
- `lib/utils/lot-template.ts` — `buildLotAnnonce({name, language, condition, extra_description})` retourne `{title, description}`. Title = `"Lot de Cartes Pokémon ${name} [${LANG_CODE}]"` (ZH → CN convention user). Description = template fixe basé sur le format Vinted réel (✨ titre, 📘 langue+drapeau, ✅ état, bloc shipping fixe Paris/92/95, 🃏 cross-sell). 7 tests.
- 3 endpoints : `POST /api/lots` (multipart upload, 5 tests), `PATCH /api/lots/[id]`, `DELETE /api/lots/[id]` (best-effort photo cleanup) — 7 tests combined.
- Composants nouveaux :
  - `<LotForm>` : 5 champs (nom + prix + langue + condition + description optionnelle) + multi-photo dropzone, preview live de l'annonce (réutilise `buildLotAnnonce`).
  - `<LotRow>` : interleavé dans `/vinted` avec badge "Lot" violet (`text-rarity-chr`).
  - `<LotAnnonceModal>` : carousel chevrons + dot indicators + arrow keys, copy clipboard, Download img anti-bot.
- Composants étendus :
  - `<EditablePriceCell>` + `<VintedListedToggle>` : prop `endpoint?` optionnelle (default `/api/cards/[id]`, lots passent `/api/lots/[id]` + `priceField="price"`).
  - `<SoldModal>` : discriminated union `entity: { kind: 'card'; card } | { kind: 'lot'; lot }`.
  - `<VintedFilters>` : chip Type (Tout / Cartes / Lots).
  - `LANGUAGE_FEMALE` + `CONDITION_LABEL` exportés depuis `vinted-template.ts` pour réutilisation.
- 237 tests (+19 vs Phase 3a : 7 lot-template + 5 POST + 7 PATCH/DELETE). 0 lint, 0 type error.
- **Pas d'OCR, pas de Pokédex, pas de Stock, pas de cron pricing pour les lots** — entité indépendante.

**Followups différés** :
1. Cleanup `lots.photo_url` (singular) et `cards.lot_id` FK orphelins (migrations cosmétiques).
2. Reorder photos après upload (drag & drop).
3. Cleanup périodique des photos orphelines en Storage si lot supprimé.

### Phase 3b2 v2 — Bulk import web

**Contexte** : Le plan initial 3b2 prévoyait un script Python CLI (`add_cards.py`) avec Gemini Batch API + cache SHA256 pour bulk import 200+ cartes à coût marginal. **Pivot post-implémentation** : user préfère 100% web pour éviter setup Python + maintenance prompt dupliqué TS↔Python. Cap raisonnable 30 photos/batch (Vercel 60s + Gemini Tier 1 15 req/min).

**Livrables** :
- **Status fallback côté serveur** dans `POST /api/cards` : si requested status='for_sale' viole la contrainte unique partielle `one_for_sale_per_group`, le serveur renvoie 409 actionnable avec le payload `existingCard` (photo + prix + meta) au lieu d'une erreur générique.
- `<DuplicateForSaleModal>` : modale actionnable affichée quand 409 — montre la carte existante (photo + nom + prix + langue + condition + variant), 2 boutons `[Annuler] / [Ajouter à mon Stock]`. Le clic "Stock" déclenche un re-POST avec status='collection'. Bénéficie au scanner unitaire ET au flow batch (puisque le batch utilise CardScanForm).
- `lib/utils/resize-image.ts` : default `maxDim = 1600px`. Testé 1024 (15× moins de tokens) mais en prod 8/30 cartes ratées car le set_code/set_number en bas de carte est trop petit. Reverted. Wired dans `CardScanForm` (scanner unitaire), `LotForm` (photos lots), et `BatchForm` (chaque photo avant OCR).
- `<CardScanForm>` accepte 4 nouveaux props prefill : `initialPhoto`, `initialPhotoFilename`, `initialOcr`, `initialEnrich`. Quand fournis, le composant skip le file picker + OCR + enrich et jump direct en phase `'reviewing'` avec le formulaire pré-rempli (`useEffect` d'init qui mirror le state-flow de `handleFile`). Permet la réutilisation par BatchForm sans dupliquer la logique formulaire.
- `<BatchForm>` (rewrite complet) : drop zone ≤30 photos → "Analyser" → OCR + enrich pré-batchés en parallèle (concurrency 5 pour respecter Gemini rate limit) → puis affiche **CardScanForm enchaîné carte-par-carte**. Save → next, cancel → skip-current. Récap final.
- Status passe de 3 boutons radio à un dropdown + champ Quantité à droite (Mobile + Batch identiques car même composant). Boucle POST × N : 1ère iter avec status demandé, suivantes avec status='collection' si Pokédex (qui ne supporte qu'1 exemplaire).
- Search Vinted étendu aux lots : matche `name` + `extra_description` + `language` (helper `matchesLotSearch` dans `VintedList`).
- **Drop entièrement** : `BatchReviewQueue.tsx` (obsolète après refactor), `app/api/pokedex/registered/route.ts` (BatchReviewQueue était son seul consumer), `scripts/add_cards.py`, `scripts/lib/`, `scripts/tests/`, `scripts/.env.example`, `scripts/requirements.txt`, `scripts/.gitignore`, `scripts/README.md` (le script Python en entier).
- 242 tests (240 baseline + 2 nouveaux pour le 409 actionnable, -2 supprimés pour l'auto-fallback), 0 lint, 0 type error.

**Décisions clés** :
- **Pas d'auto-fallback côté serveur** (initialement implémenté puis reverted v2) : user préfère contrôle explicite via la modale actionnable. Backend renvoie 409 + `existingCard`, frontend décide.
- **Resize 1600 et pas 1024** : économie tokens marginale ne vaut pas le 8/30 cartes ratées.
- **Batch = enchaînement de CardScanForm** : 1 source de vérité pour le formulaire de scan, mêmes erreurs/Pokédex replace/conflict modal partout.

**Followups différés** :
1. Compression progressive client-side si image > 1MB après resize (edge case).
2. Resume-from-CSV si user kill le batch mid-process (pas critique, le user re-drop les photos).
3. Audit + optimisation des tokens Gemini (déféré en Phase 3c — la pipeline coût trop chère selon le user, à investiguer).

## Phase 3c (terminée) — Bulk vendu + Gemini tokens optim

Brief : [PHASE_3.md](../PHASE_3.md). 22 commits.

### Volet 1 — Bulk vendu sur `/vinted`

- Mode "Sélection multiple" : toggle dans `<VintedFilters>` (bouton CheckSquare/Square). Quand actif, checkbox `accent-red` apparaît sur chaque ligne for_sale (cartes + lots) ; les boutons Annonce/Vendu individuels sont disabled.
- `<BulkSelectionBottomBar>` : fixed-bottom, `md:left-[220px]` pour offset sidebar. Affiche `cardCount`, `lotCount` et "X items au total" + boutons Annuler / Vendre la sélection.
- `<BulkSoldModal>` : liste items (thumb + badge "Lot" + langue/condition), input prix total, date picker, **preview live de la répartition** via `splitPrice(total, n)`. Le `submit` est disabled tant que `submitting === true` (anti-double-click).
- `splitPrice` (nouveau helper `lib/utils/split-bulk-price.ts`) : math en cents-int, dernière carte absorbe le remainder. 6 tests couvrent round / decimal / n=1 / n=0 throw / 99.99÷3 / 50÷3.
- `handleBulkSold` séquentiel : PATCH chaque item (cards → `/api/cards/[id]`, lots → `/api/lots/[id]`), capture `restock` + `promote` arrays côté success, comptage failures.
- `<BulkSoldRecapModal>` (nouveau composant) : carousel chevrons + dot indicators + clavier ←→, montre la liste des items vendus + section "X alertes restock" inline avec lien `/pokedex`. Remplace le `alert()` initial.
- Sur recap close → drain de la **promote queue** : chaque candidate ouvre un `<PromoteAfterSoldModal>` (réutilise le composant existant), tu décides Stock ou Mettre en vente carte par carte.
- Lots respectent maintenant les chips d'état (En ligne / Pas en ligne / À rafraîchir / Vendus). `passesStateChips` + `shouldHideForSalePile` partagés (Lot implémente `ListingShape` via `vinted_listed_at`). Bug pré-Phase-3c : tous les lots s'affichaient peu importe le filtre, comme la search avant.
- **Restock alert ne fire plus si copies stock présentes** : ajout `remainingStockCount` au détecteur (`detectRestock` skip si > 0). Endpoint `app/api/cards/[id]/route.ts` fait 3 queries en parallèle (for_sale + collection + pokedex) au lieu de 2. Avant : "Pokédex exposé pour Simiabraz" même quand l'user avait 2 copies stock prêtes à promote.

### Volet 2 — Gemini tokens optim (`lib/api/gemini-vision.ts`)

- usageMetadata extracté (`promptTokenCount`, `candidatesTokenCount`) AVANT le parse JSON, donc le compteur est rempli même si l'extraction échoue.
- Cost calculé en EUR avec `USD_TO_EUR = 0.92` fixe, `COST_USD_PER_M_INPUT = 0.25`, `COST_USD_PER_M_OUTPUT = 1.50` (tarif `gemini-3.1-flash-lite-preview` paid tier vérifié sur ai.google.dev/gemini-api/docs/pricing).
- `maxOutputTokens: 300` cap pour borner le coût output.
- `thinkingConfig: { thinkingBudget: 0 }` **fix critique** : Gemini 3.x est un reasoning model qui par défaut consomme tout le budget en `thoughtsTokenCount` invisible avant de produire la réponse → `finishReason: MAX_TOKENS`, `content: {}`, fallback Vision systématique. Désactiver le thinking règle le problème (et c'est moins cher : pas de tokens facturés en pensée).
- Prompt 500→220 tokens (raccourci sans perdre l'accuracy bench).
- `extractJsonObject(text)` : slice du premier `{` au dernier `}` avant `JSON.parse`, tolère "Here is the JSON:" et ` ```json ... ``` ` que Flash Preview sort parfois en violation de `responseMimeType`.
- Refacto signature `extractCardFromImage(buffer): Promise<{ extraction, usage }>` : `usage` est non-null dès que Gemini a répondu, même si l'extraction a foiré → on capture la consommation réelle pour la facturation. Endpoint propage usage au response Vision fallback aussi.
- Nouveau champ `_engine: 'gemini' | 'vision'` sur `OcrResult`. CardScanForm rend une ligne debug **engine-aware** :
  - `[Gemini] tokens · €cost` (succès complet)
  - `[Gemini→Vision] tokens · €cost (fallback Vision)` (parse-fail mais tokens consommés)
  - `[Vision] (Gemini indisponible)` (fetch fail)
- Resize default 1600→1400px dans `lib/utils/resize-image.ts` (~−25% image tokens vs 1600). 1024 reste exclu (8/30 cartes ratées, déjà testé).
- **Switch modèle** `gemini-3-flash-preview` → `gemini-3.1-flash-lite-preview` après bench multi-modèles. Bench script `scripts/bench-multi-model.ts` (nouveau) test 4 modèles × 5 cartes avec config prod identique (prompt + thinkingBudget=0 + responseSchema). Résultats :

| Modèle | Acc | Coût/scan | Latence |
|---|---|---|---|
| gemini-3-flash-preview *(was)* | 5/5 | €0.000921 | 4202ms |
| **gemini-3.1-flash-lite-preview** *(now)* | **5/5** | **€0.000525** | **2749ms** |
| gemini-2.5-flash | 4/5 | €0.000502 | 5476ms |
| gemini-2.5-flash-lite | 0/5 | €0.000112 | 8378ms |

- Coût par scan en prod : **~€0.000420** (avec resize 1400px) vs **€0.000921** avant Phase 3c = **−55%**.

### Bug fix bonus : CardScanForm crash en batch

`initialEnrich.candidates` peut être `undefined` si `/api/enrich` répond 200 mais avec un payload partiel (catalog timeout). Crash JS au prefill. Guard simple `?? []`.

### Volet 3 — Resilience enrichissement multilang

Bug observé en prod : carte FR Dracaufeu Trainer Gallery → Gemini envoie `set_code=DRM` (Dragon Majesty, hallucination), catalog rate, TCGdex direct rate, fallback Gemini affiche `DRM` bêtement.

- **Strategy 2.5** : `lookupByNameAndLocalId(supabase, pokemonName, setNumber, language)` — search catalog par `pokemon_name ILIKE '%X%'` + `set_number` + `language`, jusqu'à 15 candidats. Si Gemini a fourni `illustrator` → `disambiguateByIllustrator` auto-pick l'unique match. Sinon picker visuel.
- **Strategy 3a** : `lookupSubseries(setCode, localId, text, lang, pokemonNumber)` dans `lib/api/tcgdex.ts` — détecte les patterns subseries (TG, GG) et promo (SWSH+, XY+, SM+, SVP+, BW+, HGSS+), probe les parent sets en parallèle, désambiguise par dex national (plus robuste que name match — Gemini peut halluciner le nom mais retourne le bon dex).
- **Strategy 3b** : `probeSubseriesByDex(localId, pokemonNumber, lang)` — last-chance probe TG (swsh9-12) + GG (swsh12.5) en aveugle quand setCode est totalement bidon. Match strict par dex (refuse la fallback "first hit" pour éviter faux positifs).
- **Strategy 5** : Gemini-only fallback — `buildGeminiOnlyCard(body, setCode, localId, total, language)` construit un EnrichedCard depuis Gemini quand catalog + TCGdex ratent. Couvre KO/CN Crown Series et tout autre cas exotique.
- **`language` Gemini propagé au front** : avant ce fix, `detectLanguage(text)` faisait juste un regex JP-vs-non-JP, donc KO/CN/FR tombaient tous sur EN par défaut. Maintenant `OcrResult.language` populé depuis `geminiResult.language`, normalisé via `normalizeGeminiLanguage` (mappe ZH→CN, valide contre l'enum). `resolveLanguage(ocr)` dans CardScanForm prefer `ocr.language` sinon fallback regex.

### Volet 4 — UI polish

- **Mobile camera/gallery picker** : drop `capture="environment"` sur le file input. Sur Samsung Internet / Chrome Android, le système montre maintenant Camera + Files + Photos au choix.
- **`UI_LANGUAGES = ['JP', 'EN', 'FR', 'KO', 'CN']`** exporté depuis `lib/types`. Les 4 dropdowns (CardScanForm, LotForm, VintedFilters, StockFilters) consomment ce subset. DE/IT/PT/ES restent dans le type/enum DB pour backward compat mais cachés UI.
- **ZH → CN rename end-to-end** : Gemini prompt demande CN, `normalizeGeminiLanguage` mappe ZH→CN à la frontière, type `CardLanguage` accepte les 2 (legacy ZH + nouveau CN), templates Vinted/lot supportent les 2, dropdown affiche CN. Migration Postgres `20260504000000_rename_zh_to_cn.sql` (ADD VALUE 'CN', UPDATE rows).
- **Illustrator extracté + affiché** dans le snippet OCR : ligne "Extraits : set_code = X · set_number = Y · illustrator = Z". Signature unique par carte+langue, sert aussi à l'auto-disambig Strategy 2.5.

### Volet 5 — Catalog scraper Phase 3c

- `parseIllustrator(html)` : extrait `Illustrated by <a href="...artist:NAME">NAME</a>` depuis les pages card-detail LimitlessTCG.
- `enrichWithIllustrators(cards)` : fetch chaque card-detail page en parallèle (concurrence 5). Toggle via `SCRAPE_ILLUSTRATOR=1`. ~5× plus lent que le scrape "set-only" classique, donc opt-in.
- **Resume DB-driven** : avant chaque set, query `count(*)` total + `count(*) WHERE illustrator IS NULL`. Si total > 0 ET missing == 0 → SKIP. Survit aux crashes / Ctrl+C / re-runs sans state file. Override avec `FORCE_RESCRAPE=1`.
- **Catalog DE/IT/ES/PT wipé** (~58k rows). LANG_MAP du scraper réduit à JP/EN/FR.
- Migration `20260504100000_tcg_catalog_illustrator.sql` ajoute la colonne + index.

### Volet 6 — Pricing & cost

- Pricing constants corrigés : `COST_USD_PER_M_INPUT = 0.25`, `COST_USD_PER_M_OUTPUT = 1.50` (étaient à $0.075/$0.30 — Gemini 1.5 Flash, 7× sous le réel).
- `USD_TO_EUR = 0.92` fixe.
- **Coût par scan en prod : ~€0.000420** (avec resize 1400px + gemini-3.1-flash-lite-preview) vs €0.000921 avant Phase 3c = **−55%**.

### Tests + qualité

**279 vitest** (242 baseline + 37 nouveaux : splitPrice 6, restock stock-aware 1, Gemini parse-tolerance 4, Gemini usage 1, lookupSubseries 7, probeSubseriesByDex 4, lookupByNameAndLocalId 3, disambiguateByIllustrator 6, parseIllustrator 4, language normalize 1). 0 lint, 0 type error.

### Migrations Phase 3c

- `20260504000000_rename_zh_to_cn.sql` — ADD VALUE 'CN' à enum + UPDATE rows ZH→CN
- `20260504100000_tcg_catalog_illustrator.sql` — ADD COLUMN illustrator + index

### Cleanup Phase 3c

- Drop `scripts/test-bench.ts` (Vision baseline, obsolète post-Gemini)
- Drop `scripts/test-bench-claude.ts` (Claude vision bench, abandonné 0/30)
- Drop `_clearSetsCache` (no callers)

## Phase 4 — Multi-user (terminée)

Migration mono → 2-users (Lui = Hisshiden, Elle = Hilyna) sans dégrader l'UX existante. Pokédex + stock physique restent partagés ; seul l'état "en ligne sur Vinted" est désormais per-user (chaque user a son propre compte Vinted, donc ses propres annonces).

**Schéma**

- **Tables nouvelles** (migration `20260505000000_phase4_multi_user`) :
  - `card_listings` (`card_id`, `user_id`, `listed_at`) — remplace `cards.vinted_listed_at` par une row per-user-per-card.
  - `lot_listings` (`lot_id`, `user_id`, `listed_at`) — pareil pour les lots (cross-listing supporté pour les deux entités).
  - `user_profiles` (`user_id`, `display_name`) — seedée avec Lui/Elle.
- **Colonnes dropées** : `cards.vinted_listed_at` + `lots.vinted_listed_at` (backfilled vers `card_listings`/`lot_listings` Hisshiden owner avant DROP).
- **Colonne ajoutée** (migration `20260505100000_sold_by_user`) : `sold_by_user_id uuid REFERENCES auth.users` sur `cards` + `lots`. PATCH route stamp `auth.uid()` au transition status='sold'. Backfill vers Hisshiden pour les ventes pré-Phase-4. `IF NOT EXISTS` → idempotent.
- **RLS** : reads partagés (les 2 users voient toute la collection), writes sur `card_listings` / `lot_listings` scoped par `auth.uid()`.

**Frontend**

- **Hook `useUserContext`** (`lib/hooks/useUserContext.tsx`) : Provider monté dans `app/(app)/layout.tsx`, expose `myUserId / myName / partnerUserId / partnerName`.
- **Composants nouveaux** :
  - `<ListingBadges>` — Listée par Moi (vert default) / Listée par {partnerName} (identity color) / À retirer + bouton X. Per-row dans VintedRow + LotRow. Remplace l'ancien `VintedListedToggle`.
  - `<PartnerCleanupModal>` — final modal du sold flow : "X devra retirer son annonce manuellement" quand pas de restock ET partner a une annonce.
  - `<LotSoldRow>` — vue read-only des lots vendus (fond gris, sans bouton, image clic → AnnonceModal). Évite les boutons de la `<LotRow>` for-sale qui n'ont pas de sens en sold.
  - `<RouteChangeRefresher>` — `usePathname` listener qui appelle `router.refresh()` à chaque nav inter-onglets (Pokédex/Stock/Vinted/...). Combiné avec `useEffect(() => set(initial), [initial])` côté client lists, garde l'UI sync sans reload.
  - `<SaveSuccessModal>` — modal récap post-scan (`1 sur Vinted · 9 en Stock` + image carte + OK).
- **Helpers purs nouveaux** (testés) :
  - `lib/utils/listings.ts` : `getMyListing / getPartnerListing / isStaleForListing` (8 tests).
  - `lib/utils/user-colors.ts` : `colorForUserName / chipClassesForColor / badgeClassesForColor` (6 tests). Identité hardcodée Lui/Elle → tokens `--color-user-lui` (bleu `#5591c7`) / `--color-user-elle` (rose `#d97aa6`) dans `app/globals.css`.
  - `lib/utils/labels.ts` : `VARIANT_LABEL` + `RARITY_COLOR` centralisés (ex-9-fois-dupliqués). Déduplique 8 composants.
- **Endpoints nouveaux** : `POST /api/listings` + `DELETE /api/listings/[kind]/[id]` (per-user listings).

**Logique UX clé**

- **Action pile généralisée** : tout item avec mon listing actif et `status != 'for_sale'` apparaît dans `/vinted` avec le tag À retirer (ex : partner a marqué vendu, ou j'ai déplacé en Pokédex sans retirer le listing). Avant Phase 4, ces items disparaissaient et l'utilisateur ne savait pas qu'il avait du nettoyage à faire.
- **`groupCards` head priorise `for_sale`** sur les vieux `sold` du même groupe + count exclut `sold`. Évite les artefacts "À retirer x2" parasites quand une carte est promue après vente partenaire.
- **Sold flow rework** : SoldModal (form simple) → si restock candidate, PromoteAfterSoldModal → si pas de restock + partner a une annonce, PartnerCleanupModal final. Le bandeau partner-warning n'est plus affiché AVANT confirmation de la vente (ne pas effrayer l'user).
- **Scanner qty>1 sur Pokédex/Vinted** : route automatique vers Stock pour les copies au-delà de la 1ère (1 cible, reste collection). Évite l'échec 409 du unique constraint.
- **Identity colors** : Lui = bleu, Elle = rose, partout dans l'UI (chips multi-user, badges per-row, badge sold_by). "Moi" garde toujours le vert default côté self (jamais "Lui sur mon compte").
- **Variant `stamp`** ajoutée à tous les VARIANT_LABEL + dropdowns (5e variant entre `reverse_holo` et `promo`).
- **AnnonceModal close sur Escape + clic en dehors** + body scroll lock. CardZoomModal z-100 + viewport max-h (réglait clipping mobile par BottomNav).
- **`-1j` → `0j`** : daysSince clampé à 0 pour l'état "today".

**Tests** : 302 vitest passing (+23 vs Phase 3c : listings 8, user-colors 6, vinted-filter +6 multi-user chips, group-cards +2 head-selection, scrape-limitlesstcg +1 illustrator regex). 0 lint warning, 0 type error. Brief : [PHASE_4.md](../PHASE_4.md).

## Phase 4 closeout — terminée (mai 2026)

Itération de polish post-Phase 4. **Feature 1 du brief Phase 4 (import Vinted)** : tentée puis abandonnée — code complet supprimé (commit `5929f1a`). Le user préfère vider son compte Vinted et re-saisir manuellement.

### Nouvelles features livrées

- **Modal "À rafraîchir"** sur les rows Vinted stale : chip rouge cliquable + `<ConfirmDialog>` avant POST `/api/listings` (upsert restamp `listed_at = NOW()`). Remplace l'ancien micro-badge "Stale" passif.
- **`<RetireListingModal>`** : le X discret next to "Listée par Moi" (cartes seulement, pas les lots) ouvre une modale 2 boutons : Stock (PATCH `status='collection'` + DELETE listing) ou Supprimer (DELETE card + cascade listings via FK Phase 4). Bandeau partenaire si l'autre user a aussi une annonce.
- **`<StockCountChip>`** sur chaque row Vinted : "📦 × N" éditable inline (même UX que `/stock`). Click → input number, blur/Enter commit. Diff vs current count → POST `/api/cards/[id]/clone` (force `status='collection'`) ou DELETE des copies. Set 0 → wipe tout le stock du groupe (sans toucher la for_sale).
- **`/stock`** : input min=0 (au lieu de 1), modal `<ConfirmDialog>` quand on tape 0 ("Vider tout le stock de cette carte ?"). Icône `<Boxes />` ajoutée pour cohérence avec /vinted.
- **Trainer cards support end-to-end** : 2 migrations (`20260506140000_pokemon_number_nullable`, `20260506150000_pokemon_name_nullable`). Card.pokemon_name + pokemon_number deviennent `string | null` / `number | null`. Validation backend relaxée (POST/PATCH cards, +pré-check status=pokedex requires non-null). Form scanner sans `required`, label "(vide = Trainer/Énergie)". Status dropdown filtre Pokédex si pas de N°. Badges "Pas Pokédex" hidden quand `pokemon_number == null`. ScanSuggestion bandeau "Carte non-Pokémon (Trainer / Énergie / Stadium) — pas de slot Pokédex".
- **Gemini OCR** : nouveau champ `card_name_fr` (Gemini traduit le nom complet de la carte ; couvre les Trainers/Énergies que le dataset 1025 noms FR/EN ne couvre pas). Helper `cleanNull` filtre les "null"/"undefined"/"n/a" littéraux que Gemini émet parfois (sinon `formatBilingualName` produisait "null (Nの筋書き)"). Pour les Trainers : `pokemon_name` blanké si `pokemon_number` est null.
- **Batch endpoint** `POST /api/cards/batch` : accepte form + count + 1 photo, fait 1 upload + 1 SQL bulk INSERT pour N rows. Helper pur `lib/utils/build-batch-rows.ts` calcule les statuts par copy (1ère = requested, 2..N = collection si requested ∈ {for_sale, pokedex}). `CardScanForm.handleSave` réécrit pour utiliser ce endpoint. Gain perf concret : count=10 passe de ~8s à ~1.1s (-85%). Pre-checks pokedex/for_sale conservés en 409 actionnables (PokedexReplaceModal + DuplicateForSaleModal flows inchangés).
- **`/submit` UX desktop** : layout fixed-height (`100dvh - 3.5rem`), seul le formulaire scrolle (overflow-y-auto sur le pane droit dans `SubmitTabs`). Photo gauche reste anchored. Mobile inchangé.
- **Scrollbar globale** : remplace celle du système (Windows white chunky) par 6px gris translucide rgba(140,140,140,0.25) → 0.5 au hover. Pas de boutons fléchés (`::-webkit-scrollbar-button { display:none }`). Spinners `<input type=number>` virés aussi. Classe `.scrollbar-hidden` dispo si on veut cacher complètement ailleurs.

### Améliorations annexes conservées (du chantier import-vinted)

- `lib/api/tcg-catalog.ts` : `lookupByCode` switched to `ilike` — fix d'un bug case-sensitivity latent (le catalog JP stocke `SV11B` uppercase mais les call sites lowercasaient → 0% hit).

### Tests + qualité

**316 tests** vitest passing (31 fichiers). 0 lint warning. 0 type error. 12 migrations totales (+2 Phase 4 closeout).

### Action user post-merge

Appliquer manuellement les 2 nouvelles migrations via Supabase Studio :
- `supabase/migrations/20260506140000_pokemon_number_nullable.sql`
- `supabase/migrations/20260506150000_pokemon_name_nullable.sql`

## Phase 5 — Dashboard + Backups (terminée, mai 2026)

Phase 5 livre 5 sous-projets : (1) Dashboard complet avec KPIs + graphs Recharts, (2) Scripts snapshot/restore catalog versionnés en git, (3) Backup auto user data via GitHub Action, (4) Backup manuel UI dans `/options`, (5) Tech debt (validation factorisée + `PRICE_COEFFICIENT` extrait).

### Livré

**Sub-projet 1 — Dashboard** (`/dashboard`, 6e onglet de nav, icône BarChart3) :

- **KPI strip** 4 tuiles : valeur stock (somme `cm_price_avg ?? cm_price_trend ?? cm_price_low` pour status='for_sale' + 'collection'), coût OCR 30 derniers jours (EUR), scans 30j (count), restock alerts actives (count).
- **4 graphs Recharts** dans grille 2×2 :
  - `<CostBarChart>` : daily stacked Gemini + Vision (7 derniers jours)
  - `<StockValueLineChart>` : area chart for_sale + collection (30j), snapshots générés par le cron pricing quotidien
  - `<RarityDonut>` : répartition par rareté (SAR/AR/SR/CHR/RR/R_HOLO/R/UC/C/OTHER), drill-down `/pokedex?rarity=X` au clic
  - `<ScanHeatmap>` : custom SVG 52 semaines × 7 jours (GitHub-style), dégradé vert, tooltip absolute+pointer-events-none
- **2 tables** :
  - `<TopRaresList>` : top 10 cartes par prix (SAR/AR/SR uniquement), deep-link `/pokedex?pokemon_number=X` au clic sur la row
  - `<RestockAlertsList>` : liste alerts avec status/photo/nom/langue, deep-link vers Pokédex drawer via query param
- **Server component** `app/(app)/dashboard/page.tsx` fait 5 queries Supabase en parallèle (pricing cards, usage log, snapshots, restock alerts, top rares), passe les données aux client components.
- **Helpers purs testés** dans `lib/utils/dashboard-queries.ts` : `buildRarityCounts` (aggrégation rarity counts avec 0 default pour les absents), `topRaresByPrice` (filter SAR/AR/SR + sort cm_price_avg desc), `buildHeatmapMatrix` (52×7 grid depuis array de scans).

**Sub-projet 2 — Snapshot tcg_catalog** (scripts versionnés en git) :

- `scripts/snapshot-catalog.ts` : dump streaming JSONL gzippé de `tcg_catalog` + `rarity_ranks` (baseline 52724 rows catalog, 10 rows ranks) dans `backups/tcg_catalog_baseline_YYYY-MM-DD.jsonl.gz`.
- `scripts/restore-catalog.ts` : chunked restore avec confirm prompt (wipe tables + COPY chunks 5000 rows, ~10s pour 52K rows). Gère `.jsonl.gz` ou `.jsonl` (auto-décompression si zlib magic).
- **Baseline snapshot** généré et commité : `backups/tcg_catalog_baseline_2026-05-06.jsonl.gz` (~2.5MB).
- npm scripts `snapshot-catalog` + `restore-catalog` dans `package.json`.
- `backups/README.md` documente les workflows (snapshot before scraper run, restore if catalog broken).

**Sub-projet 3 — Backup auto user data** (GitHub Action) :

- `.github/workflows/backup.yml` : cron `0 3 * * *` UTC (4h/5h France selon DST), pg_dump `--data-only` des 8 tables user (cards, lots, card_listings, lot_listings, user_profiles, ocr_usage_log, stock_value_snapshots, config), gzippé, uploadé en GitHub release tagué `backup-daily-YYYY-MM-DD` (+ `backup-weekly-YYYY-WXX` les dimanches + `backup-monthly-YYYY-MM` le 1er du mois).
- **Rotation** via `scripts/backup/rotate.sh` : 30 daily / 12 weekly / 12 monthly (manual tags JAMAIS deleted). Script appelé par le workflow après chaque upload.
- **Setup requis** : ajouter `SUPABASE_DB_URL` en secret GitHub (Settings → Secrets → Actions). Valeur = Supabase Settings → Database → Connection string → "Direct connection" (format `postgresql://postgres.<ref>:<pwd>@<host>:5432/postgres`).
- **Trigger manuel** possible depuis l'onglet Actions (pour tester post-merge).

**Sub-projet 4 — Backup manuel** (bouton dans `/options`) :

- Section `<ManualBackupSection>` (server) : liste les backups existants depuis le bucket Supabase Storage `manual-backups/`, affiche filename + size + timestamp + actions (DL + Suppr).
- `<ManualBackupButton>` (client) : bouton avec confirm modal → POST `/api/backup/manual` (dump JSON gzippé des 8 tables user → bucket `manual-backups/manual-backup-YYYY-MM-DD_HH-mm-ss.json.gz`, nom unique par seconde). Spinner pendant le dump (30s typ).
- `<ManualBackupRow>` (client) : actions **Télécharger** (GET signed URL 1h) + **Supprimer** (DELETE avec confirm).
- **API routes** :
  - `app/api/backup/manual/route.ts` : POST (dump via helper `buildManualDump` + upload Storage), GET (list bucket files).
  - `app/api/backup/manual/[filename]/route.ts` : GET (signed URL), DELETE (remove file).
- **Helper pur** `lib/utils/manual-dump.ts` : `buildManualDump` (query 8 tables + envelope JSON `{ version, timestamp, tables }`) + `manualBackupFilename`.
- **Backups manuels JAMAIS rotation** (gardés indéfiniment, suppression uniquement manuelle via UI).

**Sub-projet 5 — Tech debt** :

- **`lib/constants/pricing.ts`** : extrait `PRICE_COEFFICIENT = 0.85` (était dupliqué entre `/api/cards` et `/api/cards/batch`).
- **`lib/utils/validate-card-form.ts`** : factorisé hors de `app/api/cards/route.ts` + `app/api/cards/batch/route.ts` (~117 lignes dédupliquées). Pure function `validateCardForm(formData) => { valid: true, parsed } | { valid: false, error, status }`. **7 tests dédiés** (language/condition/status invalides, pokemon_number parsing, pokedex requirement).

### Migrations Phase 5

**Action user post-merge** : appliquer manuellement les 2 migrations via Supabase Studio → SQL Editor :

- `supabase/migrations/20260507000000_phase5_dashboard.sql` : tables `ocr_usage_log` (id uuid, created_at, tokens_in, tokens_out, cost_eur, engine 'gemini'/'vision', card_id nullable FK) + `stock_value_snapshots` (id uuid, created_at, for_sale_value, collection_value). RLS reads public (writes admin-only via cron auth).
- `supabase/migrations/20260507100000_phase5_manual_backups_bucket.sql` : bucket Supabase Storage `manual-backups/` (public false, file size limit 50MB, allowed MIME types `application/gzip` + `application/json`).

### Helpers purs ajoutés Phase 5 (testés en isolation)

- `lib/utils/ocr-cost.ts` : `computeVisionCost(features)` — calcul coût Google Vision par feature (€/unit depuis constants).
- `lib/utils/stock-value.ts` : `computeStockValue(cards, field)` — agrégation pricing par status (for_sale + collection).
- `lib/utils/dashboard-queries.ts` : `buildRarityCounts` + `topRaresByPrice` + `buildHeatmapMatrix`.
- `lib/utils/manual-dump.ts` : `buildManualDump` + `manualBackupFilename`.
- `lib/utils/restock-detection.ts` : ajout `computeRestockAlerts` (déjà existait `detectRestock` + `detectPromoteOpportunity`, ajouté la fonction de liste pour le dashboard).

### Wiring Phase 5 (modifs des routes existantes)

- **`app/api/ocr/route.ts`** : INSERT dans `ocr_usage_log` après chaque scan (Gemini + Vision). Récupère `_usage` déjà extrait par `lib/api/gemini-vision.ts` (tokens_in/out, cost_eur).
- **`app/api/prices/update/route.ts`** : UPSERT dans `stock_value_snapshots` à la fin du `handleBulk` (called par le cron quotidien). 1 snapshot/jour avec valeurs for_sale + collection agrégées.

### Tests + qualité

**344 tests** vitest passing (37 fichiers). 0 lint warning. 0 type error. 14 migrations totales (+2 Phase 5).

Breakdown nouveaux tests Phase 5 :
- 7 tests `validate-card-form.test.ts`
- 6 tests `ocr-cost.test.ts`
- 4 tests `stock-value.test.ts`
- 3 tests `dashboard-queries.test.ts`
- 3 tests `manual-dump.test.ts`
- 5 tests backup API routes (`/api/backup/manual`)

### Action user post-merge (résumé)

1. **Appliquer les 2 migrations** dans Supabase Studio → SQL Editor :
   - `20260507000000_phase5_dashboard.sql`
   - `20260507100000_phase5_manual_backups_bucket.sql`
2. **Ajouter `SUPABASE_DB_URL` en secret GitHub** (Settings → Secrets → Actions). La valeur vient de Supabase Settings → Database → Connection string → "Direct connection" (format `postgresql://postgres.<ref>:<pwd>@<host>:5432/postgres`).
3. **Trigger une fois manuellement le workflow "Daily backup"** depuis l'onglet Actions pour valider le setup.

### Hors scope Phase 5 (reporté)

- **PWA install prompt** : composant `<InstallPrompt>` qui listen `window.beforeinstallprompt`, affiche un bandeau dismissible (top ou bottom), stocke le dismiss en localStorage. Monter dans `app/(app)/layout.tsx` après `<RouteChangeRefresher>`. Pas de modal invasive.
- **PWA icons 192/512** : `public/icons/` est vide. `app/manifest.ts` référence 3 PNG (`icon-192.png`, `icon-512.png`, `icon-512-maskable.png`). Le user a un logo en .png à convertir SVG puis générer les 3 icônes.
- **Manifest fine-tune** : vérifier `start_url`, `scope`, `categories`, ajouter `screenshots` (Google Play optionnel).
- **Backup auto des photos** du bucket Supabase Storage `card-photos` + `lot-photos` (GitHub release ou S3 externe).
- **UI de restore d'un backup manuel** : risqué (wipe data prod), mieux via psql local.
- **Standardisation shape des erreurs API** : aujourd'hui mix entre `{ error }` et `{ error, message, existingCard }`. Documenter une convention dans CLAUDE.md.

## Prochaines étapes (post-Phase-5)

Phase 5 close le scope fonctionnel principal d'I.R.I.S. Les features "Hors scope Phase 5" ci-dessus (PWA install prompt + icônes, backup photos, UI restore, standardisation erreurs) sont optionnelles et non-bloquantes pour l'usage quotidien.

**À faire si besoin** (punch list optionnelle) :

- [ ] **PWA install prompt** : `<InstallPrompt>` bandeau dismissible + localStorage, monté dans `(app)/layout.tsx`.
- [ ] **PWA icons** : convertir le logo user .png → SVG, générer 192/512/maskable via script (sharp ou inkscape).
- [ ] **Manifest fine-tune** : vérifier `start_url`, `scope`, `categories`, `screenshots`.
- [ ] **Backup auto photos** : extend GitHub Action workflow pour dump `card-photos` + `lot-photos` (Storage API list → download → tar.gz → release asset).
- [ ] **UI restore manuel** : route POST `/api/backup/manual/[filename]/restore` (télécharge JSON, parse, TRUNCATE tables, bulk INSERT). Risque de wipe → confirmation multi-étapes + dry-run preview obligatoire.
- [ ] **Standardiser shape erreurs API** : convention `{ error: string, details?: unknown }` everywhere, documenter dans CLAUDE.md.

**Rappel** : le user préfère garder l'app simple et stable. Ne pas ajouter de features non-demandées. Les items ci-dessus ne doivent être développés que si explicitement requis par le user.
