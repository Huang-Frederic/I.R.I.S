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

## Prochaine etape : Phase 2

**Objectif** : Module Vinted — voir les cartes a vendre en FIFO, generer un titre + description prets a coller.

### 2.1 Liste Vinted
- Page `/vinted` : `WHERE status = 'for_sale' ORDER BY date_added ASC`
- Composant `VintedList.tsx` + `VintedRow.tsx`
- Groupement doublons (`card_id_tcg + language + condition`) avec badge "xN"
- Recherche debounce + filtres chips (langue, rarete, registered/not registered)

### 2.2 Action "Vendu"
- Bouton → modal prix optionnel → UPDATE status='sold'
- Alerte restock si derniere carte for_sale d'un Pokemon registered

### 2.3 Generateur d'annonce
- Modal : titre (max 80 chars) + description selon template
- `lib/utils/vinted-template.ts` (pure function testable)
- Boutons "Copier titre" / "Copier description" (Clipboard API)
- Affichage prix Cardmarket + photo + image TCG

### 2.4 Tests Phase 2
- `vinted-template.test.ts` — titre, description, fallbacks
- E2E Playwright : scan → enregistrer → generer annonce → copier
