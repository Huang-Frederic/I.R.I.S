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
