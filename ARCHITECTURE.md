# I.R.I.S — Architecture du code

## Vue d'ensemble

I.R.I.S est une **Progressive Web App mono-utilisateur** pour gérer une collection de cartes Pokémon Trading Card Game. L'application permet de scanner des cartes via OCR (reconnaissance optique de caractères), d'enrichir automatiquement les métadonnées via un catalogue local de 111K cartes, de maintenir un "Pokédex" (1 carte par Pokémon, 1025 slots), et de gérer un stock destiné à la vente sur Vinted avec génération automatique d'annonces.

**Stack technique** : Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4 · Supabase (PostgreSQL + Storage + Auth) · Google Gemini 3 Flash Preview (OCR primaire) · Google Vision API (fallback OCR) · TCGdex (API live fallback) · Vercel (déploiement).

L'architecture s'articule autour d'un **pipeline de scan** :  
Photo → OCR (Gemini → Vision fallback) → Enrichissement (catalogue local → TCGdex fallback) → Suggestion Pokédex → Formulaire pré-rempli → Enregistrement DB.

Le projet en est à la **Phase 1.13** (terminée) — 116 tests passing, 0 lint warnings, ~20 800 lignes de code. Les phases 2-4 (module Vinted, pricing Cardmarket, dashboard) sont planifiées mais non implémentées.

---

## Diagramme d'architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ USER JOURNEY : Scan → Enrichissement → Save                    │
└─────────────────────────────────────────────────────────────────┘

  [Mobile/Desktop Browser]
         │
         │ Upload photo
         ▼
  ┌──────────────────────┐
  │ MobileSubmit.tsx     │  Client Component
  │ - Resize image       │
  │ - Show preview       │
  └──────────┬───────────┘
             │ POST FormData
             ▼
  ┌──────────────────────────────────────────────────────────────┐
  │ /api/ocr/route.ts     (Server Route Handler)                 │
  │                                                               │
  │  ┌─────────────────┐     ┌──────────────────────┐           │
  │  │ Gemini 3 Flash  │ ──> │ Google Vision API    │           │
  │  │ Primary OCR     │     │ Fallback if Gemini   │           │
  │  │ JSON structured │     │ timeout/error        │           │
  │  └─────────────────┘     └──────────────────────┘           │
  │                                                               │
  │  Returns: { text, confidence, words[], setNumberCandidate,   │
  │             setCodeCandidate, pokemonNumber?,                 │
  │             pokemonNameFr?, setName?, setNameFr? }            │
  └───────────────────────────┬──────────────────────────────────┘
                              │
                              ▼
  ┌──────────────────────────────────────────────────────────────┐
  │ /api/enrich/route.ts  (Server Route Handler)                 │
  │                                                               │
  │  4-strategy resolution (first match wins):                   │
  │  1. tcg_catalog lookup (setCode + setNumber + language)      │
  │  2. tcg_catalog by total + disambiguation by name            │
  │  3. TCGdex live API (fallback for new sets)                  │
  │  4. Return null (user fills form manually)                   │
  │                                                               │
  │  applyGeminiEnrichments() formats names as                   │
  │   "FR (Original)" + propagates pokemon_number when           │
  │  Gemini provided FR translations.                             │
  │                                                               │
  │  Returns: { bestMatch: EnrichedCard | null, candidates[] }   │
  └───────────────────────────┬──────────────────────────────────┘
                              │
                              ▼
  ┌──────────────────────┐
  │ MobileSubmit.tsx     │
  │ - 2-col layout       │
  │ - Loupe (1.5×) on    │
  │   image hover        │
  │ - Show candidates    │
  │ - Pokédex suggestion │
  │ - Pre-fill form      │
  │   (FR (Original))    │
  │ - Variant dropdown   │
  │ - Notes textarea     │
  │ - User confirms      │
  └──────────┬───────────┘
             │ POST FormData (with image)
             ▼
  ┌──────────────────────────────────────────────────────────────┐
  │ /api/cards/route.ts   (Server Route Handler)                 │
  │                                                               │
  │  1. Upload photo to Supabase Storage (card-photos bucket)    │
  │  2. INSERT into cards table (Postgres)                       │
  │  3. Return saved card                                         │
  └───────────────────────────┬──────────────────────────────────┘
                              │
                              ▼
                       [Redirect to
                        /pokedex or /vinted]
```

---

## Stack technique

| Couche | Technologie | Version / Notes |
|--------|-------------|-----------------|
| **Framework** | Next.js | 16.2.4 (App Router, async params, `proxy.ts` au lieu de `middleware.ts`) |
| **Runtime** | Node.js | ≥ 22.0.0 (spécifié via `.nvmrc` + `engines` dans `package.json`) |
| **UI** | React | 19.2.4 |
| **Langage** | TypeScript | ^5 (strict mode) |
| **Styling** | Tailwind CSS | v4 (config via `@theme` dans `app/globals.css`) |
| **Base de données** | Supabase | PostgreSQL + Storage + Auth via `@supabase/ssr` |
| **OCR primaire** | Google Gemini | 3 Flash Preview (`gemini-3-flash-preview`, JSON structuré) |
| **OCR fallback** | Google Cloud Vision | `DOCUMENT_TEXT_DETECTION` + `languageHints: ['ja', 'en']` |
| **Catalogue local** | LimitlessTCG scraping | 111K cartes (JP/EN/FR/DE/IT/ES/PT), table `tcg_catalog` |
| **API TCG live** | TCGdex | Fallback pour les nouveaux sets non scrapés |
| **Tests** | Vitest | 4.1.5 + happy-dom + @testing-library/react |
| **Linting** | ESLint | v9 (config Next.js + Prettier) |
| **Formatting** | Prettier | 3.4.1 + prettier-plugin-tailwindcss |
| **Icons** | Lucide React | 0.460.0 |
| **Fonts** | Geist + Geist Mono | Via `next/font/google` |
| **Déploiement** | Vercel | (recommandé, pas encore déployé en production) |

---

## Structure des dossiers

```
I.R.I.S/
├── app/                    # Next.js 16 App Router
│   ├── (auth)/            # Pages d'authentification (non protégées)
│   ├── (app)/             # Pages principales (protégées par proxy.ts)
│   ├── api/               # Routes API (Route Handlers)
│   ├── layout.tsx         # Root layout (HTML, fonts, theme)
│   ├── manifest.ts        # PWA manifest (Next 16 built-in)
│   ├── globals.css        # Design tokens Tailwind v4
│   └── favicon.ico
├── components/            # Composants React UI
│   ├── cards/            # Composants carte partagés
│   ├── layout/           # Navigation (Sidebar, BottomNav, ThemeToggle)
│   ├── pokedex/          # Module Pokédex (grille, drawer, filtres)
│   ├── submit/           # Module scan (MobileSubmit, SubmitTabs)
│   └── ui/               # (placeholder vide pour composants atomiques futurs)
├── lib/                   # Logique métier et intégrations
│   ├── api/              # Wrappers API externes (Gemini, Vision, TCGdex, catalog)
│   ├── supabase/         # Clients Supabase (server, client, proxy, service)
│   ├── types/            # Types TypeScript partagés
│   └── utils/            # Utilitaires (OCR extraction, Pokédex suggestion, etc.)
├── scripts/               # Scripts de développement (scraping, benchmarks)
├── supabase/              # Base de données
│   ├── migrations/       # Migrations SQL (schema initial, tcg_catalog)
│   ├── config.toml       # Configuration locale Supabase CLI
│   └── .gitignore
├── public/                # Assets statiques (icons PWA)
├── docs/                  # Documentation projet
├── *.config.*             # Fichiers de configuration (Next, TypeScript, ESLint, etc.)
└── *.md                   # Documentation racine
```

---

## Fichiers à la racine

- `.env.example` (24 lignes) — Template des variables d'environnement requises : Supabase (URL, anon key, service role), Google Vision API key, Gemini API key, Anthropic API key (scripts uniquement), `POKEMON_TCG_API_KEY` legacy, Cron secret. Guide complet dans `docs/setup.md`.
- `.gitignore` (28 lignes) — Ignore Node modules, Next.js build artifacts, env files, Supabase temp, résultats de benchmarks (`results/`), assets de cartes (`cards_assets/`).
- `.nvmrc` (1 ligne) — Pin Node.js 22.12.0 (nécessaire pour éviter les timeouts undici sur Node 18).
- `.prettierignore` (6 lignes) — Exclut `.next/`, `node_modules/`, `build/`, `coverage/`, `package-lock.json`.
- `.prettierrc` (9 lignes) — Config Prettier : single quotes, trailing commas ES5, 100 print width, plugin Tailwind.
- `AGENTS.md` (16 lignes) — Conventions multi-agents : Next.js 16 breaking changes, async params, Tailwind v4 via `@theme`, Supabase SSR patterns.
- `CLAUDE.md` (79 lignes) — Notes pour les agents IA : résumé 30s, avancement des phases, stack clé, architecture modules, pipeline enrichissement, conventions, setup, choses à ne pas faire.
- `README.md` (23 lignes) — Entry point du projet : spec complète dans `context.md`, setup dans `docs/setup.md`, commandes npm (dev, build, test, lint).
- `context.md` (858 lignes) — **Spécification complète** du projet (écrite initialement comme "PokeManager") : vision, stack, structure, schéma DB SQL complet, modules détaillés, design system, règles métier. Certaines sections sont obsolètes (ex: mention next-pwa, Cardmarket API v2.0) — CLAUDE.md + phase1-summary.md font foi.
- `eslint.config.mjs` (22 lignes) — Config ESLint v9 flat : Next.js core-web-vitals + TypeScript + Prettier, ignore `.next/`, `build/`, `supabase/.temp/`.
- `next.config.ts` (27 lignes) — Config Next.js : remote images patterns (pokemontcg.io, PokeAPI GitHub), security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy).
- `package.json` (48 lignes) — Dépendances : `@supabase/ssr`, `next@16.2.4`, `react@19.2.4`, `lucide-react`, `tailwindcss@^4`. DevDeps : `@anthropic-ai/sdk` (pour benchmarks uniquement), Vitest, ESLint, Prettier. Scripts : dev, build, test, lint, format, typecheck. Node engine ≥ 22.
- `package-lock.json` (17 933 lignes) — Lock file npm v10.
- `postcss.config.mjs` (6 lignes) — Plugin Tailwind v4 (`@tailwindcss/postcss`).
- `proxy.ts` (21 lignes) — **Équivalent de middleware.ts pour Next.js 16** : importe `updateSession` depuis `lib/supabase/proxy.ts`, exporte `config.matcher` pour exclure `_next/static`, images, manifest, API cron.
- `tsconfig.json` (35 lignes) — TypeScript strict, target ES2017, module ESNext, path alias `@/*` → `./*`.
- `vitest.config.ts` (21 lignes) — Config Vitest : plugin React, environment happy-dom, setup file, shim server-only, include `**/*.{test,spec}.{ts,tsx}`.
- `vitest.setup.ts` (3 lignes) — Import `@testing-library/jest-dom` pour les matchers DOM.
- `vitest.shim-server-only.ts` (5 lignes) — Shim vide pour `server-only` (permet d'importer les modules server-only dans les tests sans erreur).

---

## app/ — Next.js App Router

### Layout et configuration globale

- `app/layout.tsx` (47 lignes) — **Root layout** : charge fonts Geist Sans + Mono via `next/font/google`, lit le cookie `theme` (dark par défaut), applique `data-theme` sur `<html>`, metadata + viewport. Pas de children wrapper — délégué aux layouts imbriqués.
- `app/manifest.ts` (35 lignes) — **PWA manifest** (Next 16 built-in) : nom "I.R.I.S", theme color `#e05252` (rouge Pokéball), icônes 192×192, 512×512, 512×512 maskable.
- `app/globals.css` (63 lignes) — **Design tokens Tailwind v4** via `@theme` : couleurs surfaces (bg, surface, border), texte (text, text-muted, text-faint), accent rouge, badges rareté (SAR rouge, AR orange, SR doré, etc.), fonts Geist. Light mode overrides via `[data-theme='light']`.
- `app/favicon.ico` — Icône favicon (binaire).

### app/(auth)/ — Authentification

Pages **non protégées** (proxy.ts les exclut de la redirection).

- `app/(auth)/login/page.tsx` (35 lignes) — Page login : affiche `<LoginForm />`, redirect automatique vers `/` si déjà connecté (géré par proxy.ts).
- `app/(auth)/login/login-form.tsx` (73 lignes) — Formulaire email/password Supabase Auth. Server Action `signIn` dans `actions.ts`. Gère les erreurs (invalid credentials, network). État `pending` pendant soumission.
- `app/(auth)/login/actions.ts` (30 lignes) — Server Action `signIn` : `supabase.auth.signInWithPassword`, redirect vers `/` si succès.

### app/(app)/ — Pages principales (protégées par proxy.ts)

Toutes les routes sous `(app)/` requièrent authentification — proxy.ts redirige vers `/login` si non connecté.

- `app/(app)/layout.tsx` (37 lignes) — **Layout principal** : Sidebar desktop (220px fixe gauche) + BottomNav mobile (sticky bottom) + SignOutButton. Structure : `<div class="flex">` (sidebar) + `<main>` (contenu) sur desktop, `<main>` + BottomNav sur mobile.
- `app/(app)/page.tsx` (14 lignes) — **Dashboard** (TODO Phase 5) : placeholder avec titre "Tableau de bord" + texte "À venir : KPIs, cartes rares, alertes".
- `app/(app)/pokedex/page.tsx` (37 lignes) — **Page Pokédex** : fetch toutes les cartes (`status` in `pokedex`, `for_sale`, `collection`) via Supabase, affiche `<PokedexGrid cards={data} />`. Gère le cas 0 cartes avec message d'invite au scan.
- `app/(app)/submit/page.tsx` (23 lignes) — **Page Scan** : affiche `<SubmitTabs />`. Tab 'Mobile' (CardScanForm), 'Lot Vinted' (LotForm, Phase 3b1), 'Batch' (BatchForm, Phase 3b2 v2 — enchaînement CardScanForm).
- `app/(app)/vinted/page.tsx` (11 lignes) — **Page Vinted** (TODO Phase 2) : placeholder avec titre "Stock Vinted" + texte "À venir : liste FIFO, générateur d'annonce".

### app/api/ — Routes API

Toutes les routes API sont **protégées par authentification** sauf `/api/prices/update` (cron, protégé par `CRON_SECRET` — non implémenté encore).

- `app/api/ocr/route.ts` (69 lignes) — **POST /api/ocr** : extrait texte depuis une image. Body FormData : `image: File`. Chaîne : Gemini → Vision fallback. Retourne `OcrResult { text, confidence, words[], setNumberCandidate, setCodeCandidate, pokemonNumber?, pokemonNameFr?, setName?, setNameFr? }`. Gemini retourne JSON structuré enrichi (`card_name`, `set_code`, `set_number`, `language`, `confidence`, `pokemon_number`, `pokemon_name_fr`, `set_name`, `set_name_fr`), mappé vers `OcrResult` avec les 4 nouveaux champs optionnels. Si Gemini timeout/erreur/clé absente → fallback Google Vision (sans champs optionnels).

- `app/api/enrich/route.ts` (222 lignes) — **POST /api/enrich** : enrichit les données OCR via catalogue + TCGdex. Body JSON : `{ text?, setCode?, localId?, total?, language?, pokemonNumber?, pokemonNameFr?, setName?, setNameFr? }`. 4 stratégies séquentielles avec fallthrough : (1) Catalogue direct (`setCode + localId + language`), (2) Catalogue by-total + disambiguation nom OCR, (3) TCGdex live, (4) Null. Chaque stratégie a un timeout 2s (helper `withTimeout`). Helper `applyGeminiEnrichments` (interne) reformate `card_name`, `pokemon_name`, `set_name` en `"FR (Original)"` quand la langue scannée n'est pas FR et que Gemini a fourni une traduction française ; propage aussi `pokemon_number` quand le catalogue ne l'a pas. Retourne `EnrichResult { bestMatch: EnrichedCard | null, candidates: EnrichedCard[] }`.

- `app/api/cards/route.ts` (166 lignes) — **POST /api/cards** : enregistre une carte en DB. Body FormData : tous les champs card (incl. `notes`, `variant`) + `image: File` optionnel. Valide enum values (language, rarity, condition, status). Upload photo vers Supabase Storage bucket `card-photos` (path `{cardId}.jpg`). Calcule `suggested_price = cm_price_trend * 0.85` si pricing disponible. INSERT dans table `cards`. Retourne `{ card: Card }`.

- `app/api/pokedex/suggest/route.ts` (40 lignes) — **POST /api/pokedex/suggest** : retourne une suggestion Pokédex pour une carte. Body JSON : `{ pokemon_number, rarity, rarity_rank, language, cm_price_trend? }`. Fetch la carte actuelle `status='pokedex'` pour ce `pokemon_number`. Appelle `computePokedexSuggestion` (pure function). Retourne `SuggestionResult { type, message, primaryAction, secondaryActions, existingCard? }`.

- `app/api/pokedex/replace/route.ts` (65 lignes) — **POST /api/pokedex/replace** : remplace atomiquement une carte Pokédex. Body JSON : `{ old_card_id: UUID, new_card_id: UUID, old_new_status: 'for_sale' | 'collection' }`. Appelle RPC SQL `replace_pokedex_card(old_card_id, old_new_status, new_card_id)` qui UPDATE l'ancienne carte vers le nouveau status + UPDATE la nouvelle carte vers `'pokedex'`. Retourne `{ success: true }`.

---

## components/ — React UI

### components/layout/ — Navigation et layout

- `components/layout/BottomNav.tsx` (51 lignes) — Navigation mobile sticky-bottom : 4 onglets (Home, Scanner, Pokédex, Vinted). Active state en rouge. Import `nav-items.ts` pour les icônes + labels.
- `components/layout/Sidebar.tsx` (48 lignes) — Navigation desktop 220px fixe gauche : logo "I.R.I.S", 4 liens, SignOutButton + ThemeToggle en bas. Active state en rouge.
- `components/layout/SignOutButton.tsx` (32 lignes) — Bouton déconnexion : icône LogOut + "Déconnexion". Client Component, appelle Server Action `signOut` (defined inline) qui fait `supabase.auth.signOut()` + `revalidatePath('/', 'layout')` + `redirect('/login')`.
- `components/layout/ThemeToggle.tsx` (45 lignes) — Toggle dark/light mode : icône Sun/Moon. Client Component, lit/écrit cookie `theme` via Server Action `setTheme` (defined inline). Met à jour `data-theme` sur `<html>` via `document.documentElement.dataset.theme`.
- `components/layout/nav-items.ts` (20 lignes) — Config navigation : array de `{ href, label, icon }`. Utilisé par Sidebar + BottomNav.

### components/submit/ — Module de scan

- `components/submit/.gitkeep` (0 lignes) — Placeholder pour le dossier.
- `components/submit/MobileSubmit.tsx` (953 lignes) — **Composant central du scan**. Client Component. Layout 2 colonnes desktop : photo + loupe sticky à gauche, formulaire à droite. États : `phase` (idle → scanning → reviewing → saving → success/error), `previewUrl`, `photoBlob`, `form: FormFields` (incluant `notes`, `variant` Standard/Poké Ball/Master Ball/Reverse Holo/Promo), `confidence`, `suggestion: SuggestionResult`, `candidates: EnrichedCard[]`, `ocrGemini` (champs optionnels FR), `zoomPos` + `imageDimensions` pour la loupe 1.5×. Flow : (1) User clique "Scanner" → input file → resize image 1600px max via `resizeImage`, (2) POST `/api/ocr` → OCR result (avec `pokemonNumber`, `pokemonNameFr`, `setName`, `setNameFr` si Gemini), (3) POST `/api/enrich` propageant ces champs → enriched card avec noms bilingues + candidates, (4) Si plusieurs candidates → modal picker visuel (grille d'images TCG), (5) POST `/api/pokedex/suggest` → suggestion Pokédex, (6) Affiche formulaire pré-rempli (`card_name = "Gruikui (チャオブー)"` etc.) + `<ScanSuggestion />` bandeau + champ `notes` + dropdown `variant`, (7) User confirme → POST `/api/cards` → redirect `/pokedex` ou `/vinted` selon status. Bouton "Re-rechercher" repasse les champs OCR Gemini (FR translations préservées). Helpers locaux : `Field`, `Input`, `Select`, `CandidatePicker`.

- `components/submit/SubmitTabs.tsx` (34 lignes) — Wrapper tabs : 3 onglets (Mobile, Lot Vinted, Batch). Tous implémentés.

### components/cards/ — Composants partagés

- `components/cards/.gitkeep` (0 lignes) — Placeholder.
- `components/cards/ScanSuggestion.tsx` (109 lignes) — **Bandeau de suggestion Pokédex** affiché dans le formulaire de scan. Prend `suggestion: SuggestionResult` + `onActionChange: (action) => void`. 4 variantes visuelles selon `suggestion.type` : `no_pokemon_number` (neutre), `no_entry` (vert, suggère Pokédex), `can_replace` (bleu, propose upgrade), `keep_existing` (jaune, garde existant → Vinted). Affiche message + boutons radio pour primaryAction + secondaryActions. Met à jour automatiquement le champ `status` du form parent.

### components/pokedex/ — Module Pokédex

- `components/pokedex/.gitkeep` (0 lignes) — Placeholder.
- `components/pokedex/PokedexGrid.tsx` (144 lignes) — **Grille 1025 Pokémon**. Client Component. Props : `cards: Card[]`. Construit 2 maps : `pokedexMap` (1 carte par pokemon_number avec `status='pokedex'`), `availableMap` (toutes les autres cartes for_sale/collection groupées par pokemon_number). Gère 3 modes d'affichage (`grid-large` 3-6 colonnes, `grid-compact` 5-10 colonnes, `list`) persistés en `localStorage` (clé `iris.pokedex.viewMode`). Filtres via `<PokedexFilters />`. Cellule rendue selon mode : `<PokedexCell />` pour grid-* / `<PokedexListItem />` pour list. Clic → ouvre `<PokedexDrawer />` avec la carte Pokédex + cartes disponibles pour remplacement.

- `components/pokedex/PokedexCell.tsx` (66 lignes) — **Cellule grille Pokédex** : sprite PokeAPI (URL GitHub raw `sprites/pokemon/{number}.png`). Si carte possédée → couleur, sinon → silhouette (`filter: brightness(0) opacity(0.25)`). Affiche numéro + nom Pokémon ou "???" si manquant. Lazy loading image.

- `components/pokedex/PokedexListItem.tsx` (97 lignes) — **Ligne mode liste Pokédex** : sprite 48×48 + nom Pokémon + carte (card_name) + badge rareté coloré + prix Cardmarket trend (ou suggested en fallback). Bouton focusable avec aria-label complet. Affiche "Manquant" si `card === null`. Le badge ✓ / — sur le bord droit indique l'état possédé/manquant.

- `components/pokedex/PokedexDrawer.tsx` (192 lignes) — **Drawer détail Pokédex** : bottom sheet mobile, sidebar desktop. Affiche photo user + image TCG côte à côte, nom complet, set, rareté, langue, condition, prix Cardmarket (low/trend/avg/suggested), date d'ajout. Si carte manquante → message + bouton "Scanner". Bouton "Remplacer" → modal liste des cartes disponibles (`availableCards`) triées par rarity_rank DESC. Sélection → appelle `/api/pokedex/replace`.

- `components/pokedex/PokedexFilters.tsx` (113 lignes) — **Barre de filtres Pokédex** : sticky top. Toggle de mode d'affichage (3 boutons : `Grid2x2` "Grille large", `Grid3x3` "Grille compacte", `List` "Liste") avec labels visibles ≥ sm. 3 filtres data : (1) Génération (dropdown Gen 1-9 + Tous), (2) Statut (Tous/Complétés/Manquants), (3) Recherche (input texte). Affiche compteur "X affiché(s) · Y dans le filtre". Export types `FilterState { gen, status, search }`, `ViewMode = 'grid-large' | 'grid-compact' | 'list'`, `StatusFilter` + interface `PokedexFiltersProps` (incl. `viewMode` + `onViewModeChange`).

### components/ui/ — (vide pour l'instant)

- `components/ui/.gitkeep` (0 lignes) — Placeholder pour composants atomiques futurs (Button, Badge, Input…). Actuellement non utilisé — les composants sont inline dans les pages/modules.

---

## lib/ — Logique métier et intégrations

### lib/types/ — Types TypeScript partagés

- `lib/types/index.ts` (120 lignes) — **Types domaine** : enums (`CardLanguage`, `CardCondition`, `CardStatus`, `CardRarity`), interfaces DB (`Card` incluant `notes: string | null` et `variant: string | null`, `Lot`, `RarityRank`), payloads OCR/enrichment (`WordAnnotation`, `OcrResult` avec champs optionnels `pokemonNumber`, `pokemonNameFr`, `setName`, `setNameFr` populés uniquement par Gemini, `EnrichedCard`, `EnrichResult`). Mirror des enums SQL. Documentation inline.

### lib/api/ — Wrappers API externes

- `lib/api/.gitkeep` (0 lignes) — Placeholder.

- `lib/api/gemini-vision.ts` (157 lignes) — **OCR Gemini 3 Flash Preview**. `server-only`. Export `extractCardFromImage(imageBuffer: Buffer): Promise<GeminiCardExtraction | null>`. Envoie image base64 + prompt structuré (JSON schema) vers endpoint Gemini. Retourne `{ card_name, pokemon_name, set_code, set_number, set_total, language, rarity, confidence, pokemon_number, pokemon_name_fr, set_name, set_name_fr }` — les 4 derniers champs viennent du training data Gemini (numéro national Pokédex, traduction française du nom du Pokémon et du set). Timeout 15s. Retourne `null` si API key manquante, erreur réseau, timeout, ou réponse incomplète. Normalise `set_number` (strip leading zeros). Cost : ~$0.0006/scan.

- `lib/api/gemini-vision.test.ts` (422 lignes) — Tests Gemini : mock fetch, timeout, fallback null, parsing JSON, schema validation, mapping des 4 nouveaux champs FR/pokemon_number, gestion des champs partiels. 12 tests.

- `lib/api/vision.ts` (160 lignes) — **OCR Google Cloud Vision**. `server-only`. Export `detectText(base64Image: string): Promise<OcrResult>`. Appelle Vision API `DOCUMENT_TEXT_DETECTION` avec `languageHints: ['ja', 'en']`. Parse `fullTextAnnotation` : extrait `text`, `confidence` (page-level ou moyenne des blocks), `words: WordAnnotation[]` (bounding boxes normalisées [0,1]). Appelle `findSetNumberCandidate` + `findSetCodeCandidate` pour smart extraction. Retourne `OcrResult { text, confidence, words[], setNumberCandidate, setCodeCandidate }`.

- `lib/api/tcg-catalog.ts` (215 lignes) — **Catalogue local Pokémon TCG**. `server-only`. Export `lookupByCode` (strict + loose normalization), `lookupByTotal` (fallback quand set_code OCR échoue), `disambiguateByName` (filter candidates par nom OCR), `rowToEnrichedCard` (mapping DB row → EnrichedCard), `normalizeSetNumber` (strip leading zeros), `normalizeSetCode` (strip punct + lowercase), `formatBilingualName(original, frenchName, language)` (formate `"Gruikui (チャオブー)"` quand FR ≠ original et lang ≠ FR), `deriveCardNameFr(originalCardName, pokemonNameFr)` (combine nom FR + suffixe ex/EX/V/VMAX/VSTAR/GX/BREAK/LEGEND extrait du nom original). Interface `CatalogRow` mirror de table `tcg_catalog`. Gère variants set_code (SM-P vs smp, XY-P vs xyp).

- `lib/api/tcg-catalog.test.ts` (256 lignes) — Tests catalogue : normalizeSetNumber, normalizeSetCode, lookupByCode strict/loose, lookupByTotal, disambiguateByName (1 match / N matches / 0 matches), rowToEnrichedCard, formatBilingualName (cas JP/EN/FR + nom déjà en FR + frenchName null), deriveCardNameFr (suffixes ex/EX/V/VMAX, sans suffixe, FR null). 36 tests, mocks Supabase client.

- `lib/api/tcgdex.ts` (312 lignes) — **TCGdex API live fallback**. `server-only`. Export `lookupById` (direct set+localId lookup), `listSets` (cache 6h), `findCardsByTotalAndLocalId` (lookup par total imprimé), `enrichWithFrenchNames` (fetch nom FR via dexId pour annonces Vinted), `toEnrichedCard` (mapping TCGdexCard → EnrichedCard), `mapRarity` (English rarity labels → card_rarity enum), `extractPokemonName` (strip suffixes ex/V/VMAX). Cache in-memory : `FR_NAME_CACHE` (Map dexId → nom FR), `SETS_CACHE` (Map language → sets[], TTL 6h). Gère pricing Cardmarket inline (si disponible dans payload TCGdex).

- `lib/api/tcgdex.test.ts` (220 lignes) — Tests TCGdex : mapRarity, extractPokemonName, toEnrichedCard, lookupById (mock fetch), listSets (cache hit/miss), findCardsByTotalAndLocalId (strict/loose). 16 tests.

### lib/supabase/ — Clients Supabase

- `lib/supabase/.gitkeep` (0 lignes) — Placeholder.

- `lib/supabase/server.ts` (34 lignes) — **Client Supabase pour Server Components / Route Handlers**. Export `createClient(): Promise<SupabaseClient>`. Wrapper autour de `@supabase/ssr` `createServerClient`. Lit cookies via `next/headers` `cookies()`. Silent try/catch sur `setAll` (Server Components read-only ne peuvent pas set cookies → proxy.ts refresh).

- `lib/supabase/client.ts` (13 lignes) — **Client Supabase pour Client Components**. Export `createClient(): SupabaseClient`. Wrapper autour de `@supabase/ssr` `createBrowserClient`. Sessions persistées via cookies (gérés par SSR layer).

- `lib/supabase/proxy.ts` (60 lignes) — **Session refresh + auth guard**. Export `updateSession(request: NextRequest): Promise<NextResponse>`. Créé un `createServerClient` avec cookies from request. Appelle `supabase.auth.getUser()`. Redirige `/login` si non connecté (sauf pages login + API routes → retourne 401). Redirige `/` si connecté + sur `/login`. Retourne `NextResponse` avec cookies refreshed.

- `lib/supabase/service.ts` (11 lignes) — **Client Supabase Service Role** (bypass RLS). Export `createServiceClient(): SupabaseClient`. Utilise `SUPABASE_SERVICE_ROLE_KEY`. Utilisé uniquement par scripts (scraping, migrations) — jamais dans le code app.

### lib/utils/ — Utilitaires

- `lib/utils/extract-from-words.ts` (176 lignes) — **Smart extraction OCR** : parsing set_number + set_code depuis `WordAnnotation[]` (bounding boxes Vision). Export `findSetNumberCandidate` (cherche pattern `XXX/YYY` au bottom-left via `footerScore`), `findSetCodeCandidate` (cherche alphanumeric 3-8 chars avec lettres+chiffres près du set_number), `findKnownSetCodeInText` (fuzzy match d'un set_code connu dans le texte OCR complet). Filtres anti-false-positives : `looksLikeSetCode` (pas "Miyanose", "x2", "NO0499"), `isCommonFalsePositive`, `footerScore` (tie-breaker bottom-left).

- `lib/utils/extract-from-words.test.ts` (276 lignes) — Tests extraction : findSetNumberCandidate (exact token / substring / triplet split / multi-candidates tie-breaker), findSetCodeCandidate (proximité set_number, rejection false positives), findKnownSetCodeInText (fuzzy match). 18 tests.

- `lib/utils/parse-set-number.ts` (23 lignes) — **Regex parser set_number**. Export `parseSetNumber(text: string): { card: string; total: string } | null`. Regex `/(\d{1,3})\s*\/\s*(\d{1,3})/`. Utilisé comme fallback si `findSetNumberCandidate` (smart extractor) échoue.

- `lib/utils/parse-set-number.test.ts` (28 lignes) — Tests parse-set-number : exact match, whitespace variants, substring match, null si pas trouvé. 4 tests.

- `lib/utils/pokedex-suggestion.ts` (112 lignes) — **Logique suggestion Pokédex**. Export `computePokedexSuggestion(newCard: NewCardInput, existingCard: Card | null): SuggestionResult`. Pure function. 4 outcomes : (1) `no_pokemon_number` → Vinted par défaut, (2) `no_entry` → Pokédex primaire, (3) `can_replace` (rarity_rank > existing OU price > existing * 1.1) → Pokédex primaire, (4) `keep_existing` → Vinted primaire. Export aussi `actionToStatus` (helper) + types `SuggestionAction`, `SuggestionType`, `SuggestionResult`.

- `lib/utils/pokedex-suggestion.test.ts` (147 lignes) — Tests suggestion : no_pokemon_number, no_entry, can_replace (rarity higher / price tie-breaker), keep_existing. 8 tests.

- `lib/utils/pokemon-generations.ts` (17 lignes) — **Config générations Pokémon**. Export array `GENERATIONS: { id, label, start, end }[]`. Gen 1-9 avec leurs plages de numéros (1-151, 152-251, …, 906-1025). Utilisé par filtres Pokédex.

- `lib/utils/resize-image.ts` (35 lignes) — **Resize image client-side** avant upload. Export `resizeImage(file: File, maxSize: number): Promise<Blob>`. Canvas-based : charge image, scale proportionnel si width/height > maxSize, retourne Blob JPEG quality 0.9. Réduit taille upload (photos iPhone ~3MB → ~300KB).

- `lib/utils/sanity.test.ts` (20 lignes) — **Tests sanity checks** : vérifie que types principaux sont importables, que enums contiennent les valeurs attendues. 3 tests.

---

## scripts/ — Tooling de développement

Tous les scripts utilisent `tsx` (TypeScript execution) ou `npx tsx`. Aucun n'est dans `package.json` scripts — lancés manuellement.

- `scripts/scrape-limitlesstcg.ts` (631 lignes) — **Scraper LimitlessTCG** pour peupler `tcg_catalog`. Modes : `MODE=probe` (default, scrape 1 set + dump parsed rows, no DB writes), `MODE=full` (crawl 7 langues × 1163 sets = ~111K cartes, upsert Supabase). Variables env : `SET`, `PROBE_LANG`, `INSECURE_HTTPS=1` (bypass SSL cert check pour proxies corporate). Stratégie : fetch HTML `/cards/{lang}/{setId}`, parse table rows via regex (pas de DOM parser), map rarity/language vers enums, upsert via service role Supabase client. Rate limit 500ms entre requêtes. Durée full crawl : ~12 minutes. Export `mapLanguage`, `mapRarity`, `normalizeSetCode`, `scrapeSet`.

- `scripts/scrape-limitlesstcg.test.ts` (77 lignes) — Tests scraper : mapLanguage, mapRarity, normalizeSetCode. 6 tests. Scraping HTML non testé (ferait des vraies requêtes réseau).

- `scripts/test-bench.ts` (220 lignes) — **Benchmark OCR → enrichissement** : teste 30 vraies photos de cartes (stockées dans `cards_assets/`) via pipeline complet OCR + enrich. Compare baseline (Vision + catalogue) vs Gemini. Génère rapport `results/bench-{timestamp}.json` + log console. Calcule accuracy (set_code + set_number corrects), cost/scan, enrichment success rate. Utilisé pour valider Phase 1.11 (catalogue) et 1.12 (Gemini).

- `scripts/test-bench-claude.ts` (191 lignes) — Variant test-bench avec Claude Haiku 4.5 (via Anthropic SDK). Conclusion bench : 0/30 success (Claude refuse d'extraire info sans contexte additionnel, ou hallucine). Abandonné.

- `scripts/test-bench-gemini.ts` (234 lignes) — Variant test-bench avec plusieurs modèles Gemini (gemini-3-flash-preview, gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-lite). Résultat best : `gemini-3-flash-preview` 28/30 (93%) @ $0.0006/scan.

- `scripts/inspect-ocr.ts` (119 lignes) — Outil debug OCR : upload 1 photo, affiche texte brut + words avec bounding boxes + candidates extracted (setNumber, setCode). CLI interactif. Usage : `npx tsx scripts/inspect-ocr.ts path/to/card.jpg`.

---

## supabase/ — Base de données

- `supabase/.gitignore` (3 lignes) — Ignore `.branches/`, `.temp/`, `.env`.

- `supabase/config.toml` (53 lignes) — Config Supabase CLI locale : project_id, ports (API 54321, DB 54322, Studio 54323), JWT secret, service role key (placeholders `your-*` — remplacés en setup).

- `supabase/migrations/20260425224142_initial_schema.sql` (200 lignes) — **Migration initiale** : 4 enums (`card_language`, `card_condition`, `card_status`, `card_rarity`), 4 tables (`rarity_ranks` avec INSERT 10 rarities, `lots`, `cards` avec 8 index dont 1 unique partiel `one_pokedex_per_pokemon`, `config` avec INSERT 3 clés), trigger `cards_set_rarity_rank` (sync rarity → rarity_rank), RPC `replace_pokedex_card` (atomic swap), RLS policies (authenticated user full access), Storage buckets `card-photos` + `lot-photos` (public read, authenticated write).

- `supabase/migrations/20260428114538_tcg_catalog.sql` (44 lignes) — **Migration catalogue** : table `tcg_catalog` (id, cardmarket_id, set_code, set_number, set_total, language, card_name, pokemon_name, pokemon_number, set_name, rarity, image_url, scraped_at), contrainte unique `(set_code, set_number, language)`, 3 index (lookup, cardmarket, total), RLS read-only authenticated.

- `supabase/migrations/20260429142350_add_cards_variant.sql` (6 lignes) — **Migration variant** : `alter table cards add column variant text` (NULL = standard, free text pour Poké Ball / Master Ball / Reverse Holo / Promo / futur sans nouveau schema).

---

## docs/ — Documentation projet

- `docs/setup.md` (122 lignes) — **Guide setup local** : création compte Supabase (project, storage buckets, env vars), Google Cloud (Vision API key, Gemini API key, activer facturation Tier 1), clonage repo, npm install, migrations, lancement dev. Troubleshooting (Node version, SSL certs, quotas).

- `docs/phase1-summary.md` (186 lignes) — **Bilan Phase 1** complet : changelog détaillé Phase 1.1-1.12, problèmes résolus, progression test bench (10/30 → 19/30 → 28/30), architecture OCR simplifiée, cost models, open followups. Document historique clé.

- `docs/superpowers/plans/2026-04-28-tcg-catalog-cardmarket.md` (219 lignes) — Plan d'implémentation Phase 1.11 (catalogue) écrit par un agent Superpowers. Context : pivot Cardmarket API closed → LimitlessTCG scraping. Tasklist détaillée (design, DB migration, scraper, enrich strategy, tests, bench). Document archival.

- `docs/superpowers/specs/2026-04-28-tcg-catalog-cardmarket-design.md` (327 lignes) — Spec design technique Phase 1.11 : pourquoi catalogue local, trade-offs (scraping vs API), schema DB, enrich strategies, testing approach. Document archival.

---

## public/ — Assets statiques

- `public/icons/.gitkeep` (0 lignes) — Placeholder. Les icônes PWA (192×192, 512×512, 512×512 maskable) doivent être ajoutées manuellement dans `public/icons/` avant déploiement. Actuellement absentes (non bloquant pour dev local).

---

## Configuration des outils

### TypeScript

`tsconfig.json` : **strict mode** (`strict: true`), target ES2017, module ESNext (bundler resolution), path alias `@/*` → `./`, JSX preserve (handled by Next.js), incremental build, plugin Next.js.

### ESLint

`eslint.config.mjs` : flat config v9, extends `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript` + `eslint-config-prettier`. Ignore `.next/`, `build/`, `coverage/`, `supabase/.temp/`.

### Prettier

`.prettierrc` : single quotes, trailing commas ES5, 100 print width, plugin `prettier-plugin-tailwindcss` (auto-sort classes).

`.prettierignore` : exclut `.next/`, `node_modules/`, `build/`, `coverage/`, `package-lock.json`.

### Vitest

`vitest.config.ts` : environment `happy-dom`, plugin `@vitejs/plugin-react`, setup `vitest.setup.ts` (import `@testing-library/jest-dom`), alias `server-only` → shim vide, include `**/*.{test,spec}.{ts,tsx}`, exclude `node_modules`, `.next`, `e2e/`.

**Commande** : `npm test` (run once) ou `npm run test:watch` (watch mode).

**116 tests passing** (au commit latest) :
- `lib/api/gemini-vision.test.ts` — 12 tests
- `lib/api/tcg-catalog.test.ts` — 36 tests
- `lib/api/tcgdex.test.ts` — 11 tests
- `lib/utils/extract-from-words.test.ts` — 32 tests
- `lib/utils/parse-set-number.test.ts` — 7 tests
- `lib/utils/pokedex-suggestion.test.ts` — 9 tests
- `lib/utils/sanity.test.ts` — 1 test
- `scripts/scrape-limitlesstcg.test.ts` — 8 tests

Couverture : non configurée (à ajouter futur). Pas de tests E2E (Playwright différé depuis Phase 1.13).

### Tailwind v4

Config dans `app/globals.css` via `@theme { ... }` (nouveau système Tailwind v4). Pas de fichier `tailwind.config.ts`. Design tokens : couleurs, fonts, custom properties CSS. Plugin PostCSS `@tailwindcss/postcss` dans `postcss.config.mjs`.

### Next.js

`next.config.ts` : remote images patterns (pokemontcg.io pour cartes TCG officielles, PokeAPI GitHub raw pour sprites Pokédex), security headers (X-Content-Type-Options nosniff, X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin).

**Proxy.ts pattern** (Next 16) : `proxy.ts` exporte `proxy(request)` + `config.matcher` → remplace `middleware.ts` des versions précédentes.

---

## Flux de données end-to-end

### Exemple : Scan d'une carte Pokémon JP depuis mobile

1. **User ouvre `/submit`** → page charge `<SubmitTabs />` → tab "Mobile" active → affiche `<MobileSubmit />`.

2. **User clique "📷 Scanner une carte"** → `<input type="file" accept="image/*" capture="environment">` déclenche caméra mobile.

3. **User prend photo** → `MobileSubmit` reçoit `File`, appelle `resizeImage(file, 1600)` → redimensionne à 1600px max, génère preview URL, set state `phase = 'scanning'`.

4. **POST /api/ocr** FormData `{ image: File }` :
   - `app/api/ocr/route.ts` reçoit request
   - Convertit File → Buffer
   - Appelle `extractCardFromImage(buffer)` (Gemini)
   - **Gemini 3 Flash Preview** (si `GEMINI_API_KEY` présent) :
     - Encode buffer → base64
     - POST `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent`
     - Body : prompt structuré + image inline_data + responseSchema JSON
     - Timeout 15s
     - Retourne `{ card_name: "チャオブー", set_code: "BW5n", set_number: "12", set_total: 86, language: "JP", confidence: "high", pokemon_number: 499, pokemon_name_fr: "Gruikui", set_name: "ホワイトフレア", set_name_fr: "Combat de Maîtres" }`
     - Mappé vers `OcrResult { text: "チャオブー | … | BW5n-12 | JP", confidence: 0.95, setNumberCandidate: { card: "12", total: "86" }, setCodeCandidate: "BW5n", pokemonNumber: 499, pokemonNameFr: "Gruikui", setName: "ホワイトフレア", setNameFr: "Combat de Maîtres" }`
   - Si Gemini timeout/erreur → **fallback Google Vision** :
     - POST Vision API `DOCUMENT_TEXT_DETECTION`
     - Parse `fullTextAnnotation` → `{ text, pages[] }`
     - Extrait `words: WordAnnotation[]` avec bounding boxes normalisées
     - Appelle `findSetNumberCandidate(words)` → cherche pattern `XXX/YYY` bottom-left
     - Appelle `findSetCodeCandidate(words, setNumberRaw)` → cherche alphanumeric 3-8 chars près du set_number
     - Retourne `OcrResult { text, confidence, words, setNumberCandidate, setCodeCandidate }`
   - Route retourne JSON `OcrResult`

5. **Frontend reçoit OCR result** → set state `ocrText`, `confidence`, détecte langue via regex Hiragana/Katakana → `language = 'JP'`.

6. **POST /api/enrich** JSON `{ text: ocrText, setCode: "BW5n", localId: "12", total: 86, language: "JP", pokemonNumber: 499, pokemonNameFr: "Gruikui", setName: "ホワイトフレア", setNameFr: "Combat de Maîtres" }` :
   - `app/api/enrich/route.ts` reçoit request
   - Normalize input : `setCode = "BW5n"`, `localId = "12"`, `total = 86`
   - **Strategy 1 — Catalogue direct** :
     - `lookupByCode(supabase, "BW5n", "12", "JP")` avec timeout 2s
     - Fast path : `SELECT * FROM tcg_catalog WHERE set_code = 'BW5n' AND set_number = '12' AND language = 'JP'` (hit unique index)
     - Si miss → slow path : `SELECT * WHERE set_number = '12' AND language = 'JP'`, filter in JS par `normalizeSetCode("BW5n") === normalizeSetCode(row.set_code)` (gère variants SM-P/smp)
     - **Hit** → retourne `{ bestMatch: rowToEnrichedCard(row), candidates: [row] }`
   - Si Strategy 1 miss → **Strategy 2 — Catalogue by-total** :
     - `lookupByTotal(supabase, 86, "12", "JP")` → `SELECT * WHERE set_number = '12' AND language = 'JP' AND set_total >= 86 ORDER BY set_total ASC LIMIT 30`
     - Retourne N rows (ex: S4a 190/086, BW5n 86/086, etc.)
     - `disambiguateByName(rows, ocrText)` → filter par `ocrText.includes(row.card_name) || ocrText.includes(row.pokemon_name)`
     - Si 1 match → auto-select, si N matches → retourne tous, si 0 match → retourne null (fall through)
   - Si Strategy 2 miss → **Strategy 3 — TCGdex live** :
     - `listSets('ja')` → fetch `https://api.tcgdex.net/v2/ja/sets` (cache 6h)
     - `findKnownSetCodeInText(ocrText, sets.map(s => s.id))` → fuzzy match "BW5n" dans sets IDs
     - `lookupById("BW5n", "12", "ja")` → `GET https://api.tcgdex.net/v2/ja/cards/BW5n-12`
     - Si 200 → parse `TCGdexCard`, appelle `enrichWithFrenchNames` (fetch nom FR via dexId)
     - Retourne `{ bestMatch: tcgdexToEnrichedCard(card), candidates: [card] }`
   - Si Strategy 3 miss → **Strategy 4 — Null** : retourne `{ bestMatch: null, candidates: [] }`

   - Avant de retourner, `applyGeminiEnrichments(enriched, body, "JP")` reformate :
     - `card_name = "Gruikui ex (チャオブーex)"` (suffixe ex extrait du nom japonais)
     - `pokemon_name = "Gruikui (チャオブー)"`
     - `set_name = "Combat de Maîtres (ホワイトフレア)"`
     - `pokemon_number = 499` (depuis Gemini si catalogue était null)

7. **Frontend reçoit EnrichResult** :
   - Si `candidates.length > 1` → affiche modal picker visuel (grille d'images TCG) → user clique → select `bestMatch`
   - Si `bestMatch` → pré-remplit formulaire : `pokemon_name`, `pokemon_number`, `card_name` (déjà bilingue), `set_name`, `set_code`, `set_number`, `rarity`, `tcg_image_url`, pricing (si disponible). Le user peut éditer + spécifier `variant` (Standard / Poké Ball / Master Ball / Reverse Holo / Promo) + ajouter des `notes`.
   - Si `bestMatch === null` → form vide (mais `pokemon_number` pré-rempli depuis Gemini si dispo), user remplit manuellement

8. **POST /api/pokedex/suggest** JSON `{ pokemon_number: 499, rarity: "R_HOLO", rarity_rank: 4, language: "JP", cm_price_trend: 2.50 }` :
   - Route fetch `SELECT * FROM cards WHERE pokemon_number = 499 AND status = 'pokedex'`
   - Appelle `computePokedexSuggestion(newCard, existingCard)`
   - Si `existingCard` avec `rarity_rank = 3` (Rare) → `type = 'can_replace'` (4 > 3)
   - Retourne `SuggestionResult { type: 'can_replace', message: "…plus rare…", primaryAction: 'add_to_pokedex', secondaryActions: ['add_to_vinted', 'add_to_collection'], existingCard }`

9. **Frontend affiche suggestion** → `<ScanSuggestion />` bandeau bleu "Cette carte est plus rare…" + boutons radio (Pokédex checked, Vinted, Collection). User peut override → change status.

10. **User confirme formulaire** → clique "Enregistrer" → set state `phase = 'saving'`.

11. **POST /api/cards** FormData `{ pokemon_name, pokemon_number, card_name, language, rarity, condition, status: 'pokedex', notes, variant, image: File, … }` :
    - Route valide enums (language in `LANGUAGES`, etc.)
    - Génère UUID `cardId`
    - Upload photo : `supabase.storage.from('card-photos').upload('${cardId}.jpg', buffer)` → retourne publicUrl
    - Calcule `suggested_price = cm_price_trend * 0.85` si pricing disponible
    - INSERT `cards` table avec tous les champs + `image_url`, `cm_updated_at = now()`
    - Retourne `{ card: Card }`

12. **Frontend reçoit success** → set state `phase = 'success'` → affiche message "Carte enregistrée !" → setTimeout 1.5s → `router.push('/pokedex')`.

13. **User arrive sur `/pokedex`** → page fetch `SELECT * FROM cards WHERE status IN ('pokedex', 'for_sale', 'collection')` → affiche grille → cellule #499 maintenant colorée (sprite Pokémon visible).

---

## Stratégie de test

### Outils

- **Vitest** 4.1.5 : test runner, assertion library, mocking
- **happy-dom** : environment DOM lightweight (plus rapide que jsdom)
- **@testing-library/react** : render components, queries, user events
- **@testing-library/jest-dom** : matchers DOM (`.toBeInTheDocument()`, etc.)

### Ce qui est testé

- **Logique métier pure** : `pokedex-suggestion.ts`, `parse-set-number.ts`, `extract-from-words.ts`, `pokemon-generations.ts` → fonctions pures, facile à tester.
- **Wrappers API** : `tcgdex.ts`, `gemini-vision.ts`, `tcg-catalog.ts` → mock fetch + Supabase client, test parsing + error handling.
- **Scripts** : `scrape-limitlesstcg.ts` → test helpers mapping (language, rarity, setCode normalization). Scraping HTML non testé (ferait vraies requêtes réseau).

### Ce qui n'est PAS testé

- **Composants React** : 0 tests UI actuellement. Politique projet : pas de tests UI sur les composants React (cf. Phase 1.13 / 2.1 / 3a / 3b1 / 3b2 v2). Smoke test à la main + Playwright différé.
- **Routes API** : tests integration en place pour `/api/cards`, `/api/cards/[id]`, `/api/lots`, `/api/lots/[id]`, `/api/prices/update` (Phase 3a + 3b1 + 3b2 v2). Manquent : `/api/ocr`, `/api/enrich`, `/api/pokedex/replace`, `/api/pokedex/suggest`.
- **Database** : 0 tests SQL. RPC `replace_pokedex_card`, trigger `cards_set_rarity_rank` non testés (différé).
- **E2E** : 0 tests Playwright. Différé depuis Phase 1.13.

### Comment lancer

```bash
npm test              # Run all tests once
npm run test:watch    # Watch mode
npx vitest run --coverage  # Coverage (non configuré)
```

**116 tests, 0 failures** (au commit latest). Durée ~1s.

---

## Variables d'environnement

Fichier `.env.local` (git-ignored, copier depuis `.env.example`) :

| Variable | Où utilisée | Comment obtenir |
|----------|-------------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Tous clients Supabase | Dashboard Supabase > Settings > API > Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clients browser + server | Dashboard Supabase > Settings > API > anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Scripts scraping (bypass RLS) | Dashboard Supabase > Settings > API > service_role (secret) |
| `GOOGLE_VISION_API_KEY` | `lib/api/vision.ts` (OCR fallback) | Google Cloud Console > APIs & Services > Credentials > Create API Key, activer Cloud Vision API |
| `GEMINI_API_KEY` | `lib/api/gemini-vision.ts` (OCR primaire) | Google AI Studio > Get API Key, activer facturation GCP (Tier 1 quotas : 15 req/min, $0.075/1M tokens input) |
| `CRON_SECRET` | `/api/prices/update` (en production depuis Phase 3a) | Token aléatoire généré (`openssl rand -base64 32`), passer via `Authorization: Bearer ${CRON_SECRET}` |
| `NEXT_PUBLIC_APP_URL` | Metadata (optional) | URL production Vercel (ex: `https://iris.vercel.app`) |

**Setup complet** : lire `docs/setup.md`.

**Note Gemini** : GEMINI_API_KEY requis pour Phase 1.12. Sans lui, OCR fallback Google Vision (fonctionne mais accuracy 63% vs 93%).

**Note Cardmarket** : Les variables `MKM_APP_TOKEN`, `MKM_APP_SECRET`, `MKM_ACCESS_TOKEN`, `MKM_ACCESS_SECRET` mentionnées dans `context.md` sont **obsolètes** (API fermée 2023). Le catalogue est alimenté par scraping LimitlessTCG. Phase 3a a finalement utilisé TCGdex (pricing.cardmarket.{low/trend/avg/updated} déjà inclus dans le catalogue gratuit) au lieu d'un scraper Cardmarket direct.

---

## Conventions de code

### TypeScript strict

- `strict: true` dans `tsconfig.json`
- Pas de `any` sans justification (lint warning)
- Types explicites pour toutes les fonctions publiques
- Enums TypeScript mirroring SQL enums (`CardLanguage`, `CardRarity`, etc.)

### Server-only guard

Tous les modules qui touchent secrets (API keys, service role) importent `'server-only'` en première ligne. Exemples : `lib/api/vision.ts`, `lib/api/gemini-vision.ts`, `lib/api/tcgdex.ts`, `lib/supabase/service.ts`. Erreur de build si importés dans Client Component.

### Supabase patterns

- **Server Components / Route Handlers** : `createClient()` from `lib/supabase/server.ts`
- **Client Components** : `createClient()` from `lib/supabase/client.ts`
- **Scripts (bypass RLS)** : `createServiceClient()` from `lib/supabase/service.ts`
- Jamais importer `@supabase/auth-helpers` (deprecated)

### Design tokens

Couleurs via custom properties CSS dans `app/globals.css` : `--color-bg`, `--color-text`, `--color-red`, etc. Utilisées dans Tailwind : `bg-bg`, `text-text-muted`, `border-border`. Pas de hard-coded hex colors dans components.

### Naming

- **Fichiers** : kebab-case (`pokedex-suggestion.ts`, `tcg-catalog.ts`)
- **Composants React** : PascalCase (`MobileSubmit.tsx`, `PokedexGrid.tsx`)
- **Fonctions** : camelCase (`computePokedexSuggestion`, `lookupByCode`)
- **Types/Interfaces** : PascalCase (`Card`, `EnrichResult`, `SuggestionAction`)
- **Constantes** : SCREAMING_SNAKE_CASE (`CONFIDENCE_THRESHOLD`, `PRICE_COEFFICIENT`)

### Error handling

- API routes : retourner `NextResponse.json({ error: string }, { status: number })`
- Client Components : try/catch + set error state + afficher message user-friendly
- Pas de `throw` non catchés dans Server Components (cause 500 page)

### Comments

- Français pour les commentaires business (ex: "Stratégie de recherche : …")
- Anglais pour les commentaires techniques bas-niveau (ex: "Normalize bounding box to [0,1]")
- JSDoc pour toutes les fonctions publiques exportées

---

## Fichiers gitignored notables

Ces fichiers existent localement mais ne sont jamais committés :

- `.env.local` — Secrets (API keys, Supabase service role)
- `.env` — Même chose
- `node_modules/` — 300+ MB de dépendances npm
- `.next/` — Build artifacts Next.js (~50 MB)
- `cards_assets/` — Photos de benchmark (30 JPEGs, ~10 MB) — utilisées par `scripts/test-bench*.ts`
- `results/` — Outputs de benchmarks JSON (`bench-*.json`, `scrape-*.json`)
- `supabase/.temp/` — Fichiers temporaires Supabase CLI

**Pourquoi `cards_assets/` gitignored ?** Ce sont des vraies photos de cartes Pokémon (potentiellement sous copyright). Le benchmark peut tourner sans elles (skip), ou en les téléchargeant manuellement.

**Pourquoi `results/` gitignored ?** Les résultats de bench changent à chaque run (timestamps, IDs uniques). Historique non nécessaire — seul le résumé dans `docs/phase1-summary.md` compte.

---

## Phases du projet

### Phase 1 — TERMINEE ✅

**Objectif** : Foundation — auth, layout, OCR, enrichissement, scan mobile, Pokédex grille.

**Livrables** :
- Setup Next.js 16 + TypeScript + Tailwind v4 + Supabase
- Schéma DB initial (cards, lots, rarity_ranks, config)
- Auth Supabase email/password
- Proxy.ts auth guard
- Layout (Sidebar desktop, BottomNav mobile, ThemeToggle)
- OCR Google Vision + smart extraction (set_number, set_code via bounding boxes)
- Enrichissement TCGdex (170 sets JP)
- Scan mobile (`MobileSubmit.tsx`) : photo → OCR → enrich → form pré-rempli → save
- Suggestion Pokédex (4 outcomes : no_entry, can_replace, keep_existing, no_pokemon_number)
- Grille Pokédex 1025 cellules avec filtres (génération, statut, recherche)
- Drawer Pokédex (détail + bouton Remplacer)
- 52 tests, 0 lint warnings

### Phase 1.11 — TERMINEE ✅

**Objectif** : Catalogue local Pokémon TCG via scraping LimitlessTCG → améliorer enrichissement de 33% à 63-73%.

**Livrables** :
- Table `tcg_catalog` (111K cartes JP/EN/FR/DE/IT/ES/PT)
- Script `scrape-limitlesstcg.ts` (crawl 7 langues × 1163 sets en ~12 min)
- Enrich strategy 1-4 (catalogue direct → catalogue by-total → TCGdex live → null)
- Helpers `lookupByCode`, `lookupByTotal`, `disambiguateByName`
- Normalisation set_code (SM-P/smp, XY-P/xyp) + set_number (leading zeros)
- Benchmark : 19/30 (63%) baseline → ~22/30 (73%) effectif
- 81 tests (+ 19 nouveaux), 0 lint warnings

**Pivot Cardmarket** : Découverte que l'API Cardmarket est fermée aux nouvelles apps (2023). Pivot vers LimitlessTCG (robots.txt OK, HTML parsable).

### Phase 1.12 — TERMINEE ✅

**Objectif** : Gemini vision OCR primaire → améliorer enrichissement de 63% à 93%.

**Livrables** :
- `lib/api/gemini-vision.ts` (wrapper Gemini 3 Flash Preview, JSON structuré)
- `app/api/ocr/route.ts` chaîne : Gemini → Vision fallback
- Benchmark : 28/30 (93%) @ $0.0006/scan (6¢/100 scans)
- Normalisation set_code strict/loose dans `tcg-catalog.ts`
- 97 tests (+ 16 nouveaux), 0 lint warnings

**Trade-off** : Gemini 3 Flash est un modèle **preview** (Google peut le retirer). Fallback Vision préservé pour robustesse.

### Phase 1.13 — TERMINEE ✅

**Objectif** : Traductions FR via Gemini + modes d'affichage Pokédex + refonte UI scanner + dropdown variant.

**Livrables** :
- **Gemini OCR enrichi** : `lib/api/gemini-vision.ts` retourne 4 nouveaux champs depuis le training data Gemini — `pokemon_number` (national dex 1-1025), `pokemon_name_fr` (ex: "Gruikui" pour チャオブー), `set_name`, `set_name_fr` (ex: "Combat de Maîtres" pour ホワイトフレア).
- **Names bilingues** : `lib/api/tcg-catalog.ts` exporte `formatBilingualName` + `deriveCardNameFr` ; `app/api/enrich/route.ts` applique `applyGeminiEnrichments` après chaque hit catalogue → `card_name = "Gruikui ex (チャオブーex)"`, `set_name = "Combat de Maîtres (ホワイトフレア)"`.
- **Variant dropdown** : nouvelle migration `20260429142350_add_cards_variant.sql` (colonne `variant text` sur `cards`) ; `MobileSubmit.tsx` propose Standard / Poké Ball / Master Ball / Reverse Holo / Promo.
- **UI scanner** : layout 2 colonnes desktop (photo sticky + form), loupe magnifier 1.5× sur hover, formulaire en grille plus dense, bouton "Re-rechercher" préserve les champs OCR Gemini.
- **Pokédex view modes** : 3 modes (`grid-large` 3-6 colonnes, `grid-compact` 5-10 colonnes, `list` ligne sprite + nom + carte + rareté + prix) persistés dans `localStorage` (clé `iris.pokedex.viewMode`). Nouveau composant `PokedexListItem.tsx`.
- **Renommage UX** : "TCG match" → "Match catalogue" dans le bandeau.
- 116 tests (+19), 0 lint warning.

**Followups différés** : pricing Cardmarket par variant (les Poké Ball valent souvent 2× le standard mais le scraper actuel ne distingue pas), wiring Pokédex auto-suggestion sur changement manuel de `pokemon_number`.

### Phase 2 — TODO 🚧

**Objectif** : Module Vinted — liste FIFO, générateur d'annonce, action "vendu".

**Planned** :
- Page `/vinted` : `SELECT * WHERE status='for_sale' ORDER BY date_added ASC`
- Composants `VintedList.tsx`, `VintedRow.tsx`
- Groupement doublons (card_id_tcg + language + condition) avec badge "×N"
- Recherche + filtres chips (langue, rareté, registered/not)
- Action "Vendu" → modal prix → UPDATE status='sold' → alerte restock si dernière carte for_sale d'un Pokémon registered
- Générateur d'annonce (`lib/utils/vinted-template.ts`) : titre max 80 chars + description template
- Modal avec prix Cardmarket + photo + boutons "Copier titre" / "Copier description"
- Tests `vinted-template.test.ts`

### Phase 3 (3a + 3b1 + 3b2 v2) — TERMINÉE mai 2026

Voir CLAUDE.md pour le bilan. Résumé : cron pricing TCGdex quotidien (Phase 3a), lots Vinted bundles (Phase 3b1), bulk import 100% web avec enchaînement CardScanForm (Phase 3b2 v2). 242 tests vitest, 0 lint, 0 type error.

### Phase 3c — TODO 🚧

**Objectif** : Bulk vendu (sélecteur multi-cartes vendues ensemble + division du prix de vente entre les cartes pour avoir le prix unitaire) + Refining Gemini tokens (audit du nombre de tokens entrant et sortant + optimisation pour réduire le coût de la pipeline).

Brief : [PHASE_3.md](PHASE_3.md) à la racine.

### Phase 4 — TODO 🚧

**Objectif** : Passage à 2 users (RLS multi-tenant Supabase) + Import one-shot du profil Vinted existant (parser le HTML de la page profil pour ingester les annonces existantes — CDN Vinted source d'images).

Brief : [PHASE_4.md](PHASE_4.md) à la racine.

### Phase 5 — TODO 🚧

**Objectif** : Dashboard (KPIs valeur stock, top cartes rares, alertes restock, **+ tracking tokens consommés et coût/jour app**) + polish PWA (install prompt, icônes 192/512, manifest fine-tune).

---

## Fichiers détaillés par module

### Module OCR (6 fichiers, ~1100 lignes)

| Fichier | Lignes | Description |
|---------|--------|-------------|
| `lib/api/gemini-vision.ts` | 157 | Wrapper Gemini 3 Flash Preview : `extractCardFromImage(buffer)` → JSON structuré (incl. `pokemon_number`, `pokemon_name_fr`, `set_name`, `set_name_fr`). Timeout 15s, retourne `null` si erreur. Export `GeminiCardExtraction` interface. |
| `lib/api/gemini-vision.test.ts` | 422 | Tests Gemini : mock fetch, timeout, parsing, schema validation, mapping FR + pokemon_number, champs optionnels. 12 tests. |
| `lib/api/vision.ts` | 160 | Wrapper Google Cloud Vision : `detectText(base64)` → `OcrResult`. DOCUMENT_TEXT_DETECTION, languageHints JP/EN. Extrait words + bounding boxes. |
| `app/api/ocr/route.ts` | 69 | Route POST /api/ocr : FormData image → Gemini → Vision fallback → retourne `OcrResult` (avec champs FR/pokemon_number quand Gemini répond). |
| `lib/utils/extract-from-words.ts` | 176 | Smart extraction : `findSetNumberCandidate`, `findSetCodeCandidate`, `findKnownSetCodeInText`. Bounding box scoring, anti-false-positives. |
| `lib/utils/extract-from-words.test.ts` | 276 | Tests extraction : exact token, substring, triplet split, tie-breaker, false positives rejection. 32 tests. |

### Module Catalogue (4 fichiers, ~1100 lignes)

| Fichier | Lignes | Description |
|---------|--------|-------------|
| `lib/api/tcg-catalog.ts` | 215 | Helpers catalogue : `lookupByCode` (strict/loose), `lookupByTotal`, `disambiguateByName`, `rowToEnrichedCard`, `normalizeSetNumber`, `normalizeSetCode`, `formatBilingualName` (formate "FR (Original)"), `deriveCardNameFr` (combine nom FR + suffixe ex/V/VMAX/etc). |
| `lib/api/tcg-catalog.test.ts` | 256 | Tests catalogue : normalize, lookup, disambiguation, formatBilingualName, deriveCardNameFr. 36 tests, mock Supabase. |
| `supabase/migrations/20260428114538_tcg_catalog.sql` | 44 | Migration table `tcg_catalog` : schema, unique constraint, 3 index, RLS. |
| `scripts/scrape-limitlesstcg.ts` | 631 | Scraper LimitlessTCG : crawl 7 langues × 1163 sets → upsert Supabase. Modes probe/full, rate limit 500ms. |

### Module Enrichissement (3 fichiers, ~750 lignes)

| Fichier | Lignes | Description |
|---------|--------|-------------|
| `app/api/enrich/route.ts` | 222 | Route POST /api/enrich : 4 strategies (catalogue direct → by-total → TCGdex → null). Helper `applyGeminiEnrichments` qui formate noms bilingues + propage `pokemon_number`. Timeout 2s/strategy. Retourne `EnrichResult`. |
| `lib/api/tcgdex.ts` | 312 | TCGdex API wrapper : `lookupById`, `listSets` (cache 6h), `findCardsByTotalAndLocalId`, `enrichWithFrenchNames`, `toEnrichedCard`, `mapRarity`. |
| `lib/api/tcgdex.test.ts` | 220 | Tests TCGdex : rarity mapping, toEnrichedCard, lookup, cache. 11 tests. |

### Module Scan Mobile (3 fichiers, ~1100 lignes)

| Fichier | Lignes | Description |
|---------|--------|-------------|
| `components/submit/MobileSubmit.tsx` | 953 | Composant principal scan : layout 2 colonnes desktop (photo+loupe sticky / form), phases (idle → scanning → reviewing → saving → success/error), OCR + enrich calls (passe les 4 champs Gemini), candidate picker, form (notes + variant dropdown Standard/Poké Ball/Master Ball/Reverse Holo/Promo), loupe magnifier 1.5×, Pokédex suggestion, save. |
| `components/submit/SubmitTabs.tsx` | 34 | Tabs wrapper : Mobile, Lot Vinted, Batch — tous implémentés. |
| `components/cards/ScanSuggestion.tsx` | 109 | Bandeau suggestion Pokédex (label "Match catalogue") : 4 variantes visuelles (no_pokemon_number, no_entry, can_replace, keep_existing), boutons radio actions. |

### Module Pokédex (9 fichiers, ~900 lignes)

| Fichier | Lignes | Description |
|---------|--------|-------------|
| `components/pokedex/PokedexGrid.tsx` | 144 | Grille 1025 Pokémon : maps pokedex/available, filtres, 3 modes d'affichage (grid-large / grid-compact / list) persistés en localStorage, render conditionnel cell vs list-item, drawer. |
| `components/pokedex/PokedexCell.tsx` | 66 | Cellule sprite PokeAPI : couleur si possédée, silhouette sinon. Lazy loading. |
| `components/pokedex/PokedexListItem.tsx` | 97 | Ligne mode liste : sprite 48px + n° + nom Pokémon + carte + badge rareté + prix Cardmarket trend (ou suggested fallback). Badge ✓/— pour état possédé/manquant. |
| `components/pokedex/PokedexDrawer.tsx` | 192 | Drawer détail : photo + image TCG, infos, prix, bouton Remplacer, modal liste cartes disponibles. |
| `components/pokedex/PokedexFilters.tsx` | 113 | Filtres : toggle mode d'affichage (3 boutons + labels visibles ≥ sm), génération, statut, recherche. Export `ViewMode = 'grid-large' | 'grid-compact' | 'list'`. |
| `lib/utils/pokedex-suggestion.ts` | 112 | Logique suggestion : `computePokedexSuggestion` (pure function), 4 outcomes, price tie-breaker. |
| `lib/utils/pokedex-suggestion.test.ts` | 128 | Tests suggestion : 4 outcomes, price breaker. 9 tests. |
| `lib/utils/pokemon-generations.ts` | 17 | Config générations 1-9 avec plages numéros. |
| `app/api/pokedex/replace/route.ts` | 65 | Route POST swap atomique : appelle RPC `replace_pokedex_card`. |

### Module Vinted (0 fichiers, TODO Phase 2)

Page `/vinted` est un placeholder (11 lignes). Aucun composant `VintedList`, `VintedRow`, `AnnonceGenerator` implémenté.

### Database (3 fichiers, ~250 lignes SQL)

| Fichier | Lignes | Description |
|---------|--------|-------------|
| `supabase/migrations/20260425224142_initial_schema.sql` | 200 | Schema initial : 4 enums, 4 tables (rarity_ranks, lots, cards, config), trigger rarity_rank, RPC replace_pokedex_card, RLS, Storage buckets. |
| `supabase/migrations/20260428114538_tcg_catalog.sql` | 44 | Table `tcg_catalog` : 111K cartes, unique constraint (set_code, set_number, language), 3 index. |
| `supabase/migrations/20260429142350_add_cards_variant.sql` | 6 | Colonne `variant text` sur `cards` (NULL = standard, free text Poké Ball/Master Ball/Reverse Holo/Promo). |

### Tests (8 fichiers, 116 tests)

| Fichier | Tests | Description |
|---------|-------|-------------|
| `lib/api/gemini-vision.test.ts` | 12 | Gemini wrapper : fetch mock, timeout, parsing, mapping FR + pokemon_number. |
| `lib/api/tcg-catalog.test.ts` | 36 | Catalogue : normalize, lookup strict/loose, disambiguation, formatBilingualName, deriveCardNameFr. |
| `lib/api/tcgdex.test.ts` | 11 | TCGdex : rarity map, toEnrichedCard, lookup, cache. |
| `lib/utils/extract-from-words.test.ts` | 32 | Smart extraction : set_number, set_code, false positives. |
| `lib/utils/parse-set-number.test.ts` | 7 | Regex parser set_number. |
| `lib/utils/pokedex-suggestion.test.ts` | 9 | Suggestion Pokédex : 4 outcomes, price breaker. |
| `lib/utils/sanity.test.ts` | 1 | Sanity check : imports + enums values. |
| `scripts/scrape-limitlesstcg.test.ts` | 8 | Scraper helpers : mapLanguage, mapRarity, normalizeSetCode. |

---

## Conclusion

I.R.I.S est un projet **bien architecturé** (App Router Next 16, TypeScript strict, séparation client/server claire, tests unitaires solides) et **opérationnel** pour la Phase 1.13 (scan + enrichissement + Pokédex multi-modes + traductions FR + variantes). Le pipeline OCR → enrichissement atteint **93% accuracy** (28/30 cartes bench) grâce à Gemini 3 Flash Preview + catalogue local 111K cartes ; les noms sont désormais affichés en français devant l'original (ex: `"Gruikui (チャオブー)"`) quand Gemini fournit la traduction.

**Points forts** :
- Stack moderne (Next 16, React 19, Tailwind v4, Supabase SSR)
- OCR multi-stratégies (Gemini → Vision fallback) avec cost $0.0006/scan
- Catalogue local exhaustif (111K cartes, 7 langues, scraping LimitlessTCG robots.txt OK)
- Enrichissement 4-strategies avec disambiguation intelligente + reformatage bilingue automatique
- Suggestion Pokédex automatique (comparaison rarity + prix)
- Pokédex 3 modes (grille large, grille compacte, liste) avec préférence persistée localStorage
- Scanner UI 2-colonnes avec loupe magnifier 1.5×, dropdown variant (Poké Ball / Master Ball / Reverse Holo / Promo), notes
- Tests unitaires 116 passing, 0 lint warnings
- Documentation complète (CLAUDE.md, context.md, phase1-summary.md, setup.md)

**Points à améliorer (Phases 2-4)** :
- Module Vinted (liste FIFO, générateur annonce, action vendu)
- Pricing Cardmarket (alternative API fermée : TCGplayer ou scraping HTML), différenciation par variant
- Dashboard (KPIs, cartes rares, alertes restock)
- Tests E2E Playwright (flow complet scan → save → Pokédex)
- PWA polish (icônes manifest, test install homescreen Android)
- Déploiement Vercel production

**Fichiers totaux** : 93 (inventaire `git ls-files`), ~20 800 lignes de code.

---

**Dernière mise à jour** : 2026-04-29 (commit `3dc0689` — Docs: catalog + LimitlessTCG pivot — Phase 1.11 wrap-up)
