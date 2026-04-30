# I.R.I.S — Notes pour les agents IA

## Le projet en 30 secondes

PWA mono-utilisateur (Next.js 16, App Router, TypeScript, Tailwind v4, Supabase, Vercel) pour gérer une collection Pokémon TCG. Deux flux : Pokédex (1 carte par Pokémon, 1025 cellules) et stock Vinted (FIFO + prix Cardmarket live + générateur d'annonces).

Spec complète : [context.md](context.md). Plan d'implémentation en 4 phases : `~/.claude/plans/j-aimerais-que-tu-lises-cached-robin.md`.

## Avancement

- **Phase 1** — TERMINEE. Auth, layout, OCR, enrichissement TCGdex, scan mobile, suggestion Pokédex, grille Pokédex, candidate picker. 52 tests, 0 lint warning.
- **Phase 1.11** — TERMINEE. Catalogue local Pokémon TCG via scraping LimitlessTCG. 111K cartes JP/EN/FR/DE/IT/ES/PT. Enrichissement post-scan passe de 33% à 63-73% (test bench). 81 tests, 0 lint warning.
- **Phase 1.12** — TERMINEE. Gemini 3 Flash Preview comme moteur OCR primaire. Extraction structurée JSON (`card_name`, `set_code`, `set_number`, `language`, `confidence`). Bench : 28/30 (93%), fallback Google Vision. Cost : 6¢/mois pour 100 scans. 97 tests, 0 lint warning.
- **Phase 1.13** — TERMINEE. Traductions FR via Gemini (4 nouveaux champs `pokemon_number`, `pokemon_name_fr`, `set_name`, `set_name_fr`) → noms affichés `"FR (Original)"` (ex: `"Gruikui (チャオブー)"`). Scanner UI 2-colonnes + loupe magnifier 1.5× + dropdown variant (Poké Ball / Master Ball / Reverse Holo / Promo) + notes. Pokédex 3 modes d'affichage (grid-3 / grid-5 / list) persistés en localStorage. Migration `add_cards_variant`. 116 tests, 0 lint warning.
- **Phase 2** — TERMINEE. Module Vinted : liste FIFO + groupement variant-aware (`card_id_tcg + language + condition + variant`), édit prix inline, action "Vendu" + restock toast, générateur d'annonce avec smart-truncate titre 80 chars + clipboard. 144 tests, 0 lint warning.
- **Phase 3** — A FAIRE. Cardmarket OAuth, cron prix, mode lot, script Python CLI.
- **Phase 4** — A FAIRE. Dashboard, bulk vendu, polish PWA.

Bilan détaillé : [docs/phases-summary.md](docs/phases-summary.md).

## Stack à connaître

- **Next.js 16** — `proxy.ts` (pas `middleware.ts`), `params` est async, App Router strict, manifest via `app/manifest.ts`.
- **Tailwind v4** — config dans `app/globals.css` via `@theme` (pas de `tailwind.config.ts`).
- **Supabase** — via `@supabase/ssr` (helpers dans `lib/supabase/`).
- **TCGdex** — Fallback API live pour sets non scrapés. Cardmarket pricing inclus.
- **LimitlessTCG** — Source du catalogue local (111K cartes, scraping robots.txt OK).
- **Gemini 3 Flash Preview** — Moteur OCR primaire via `lib/api/gemini-vision.ts` (JSON structuré + 4 champs FR/pokemon_number depuis training data). Google Vision (fallback si Gemini erreur ou absent).
- **Scanner UI** — Layout 2 colonnes desktop, loupe magnifier 1.5× sur la photo, formulaire dense avec variant + notes. FR auto-translation propagée du scan jusqu'à la persistance.
- **Tests** — Vitest + happy-dom. Lancer : `npm test`.

## Architecture clé

| Module | Fichiers |
|---|---|
| OCR | `lib/api/gemini-vision.ts` (primaire), `lib/api/vision.ts` (fallback), `app/api/ocr/route.ts` |
| Catalogue local | `lib/api/tcg-catalog.ts` (incl. `formatBilingualName` + `deriveCardNameFr`), table `tcg_catalog` (111K cartes) |
| Migration variant | `supabase/migrations/20260429142350_add_cards_variant.sql` (colonne `variant text` sur `cards`) |
| Scraper LimitlessTCG | `scripts/scrape-limitlesstcg.ts` (~12 min, 7 langues, 1163 sets) |
| Enrichissement | `app/api/enrich/route.ts` (catalogue → TCGdex fallback, helper `applyGeminiEnrichments` pour noms bilingues) |
| Smart extraction | `lib/utils/extract-from-words.ts` (set_code + set_number depuis bounding boxes Vision) |
| Scan mobile | `components/submit/MobileSubmit.tsx` (2-col + loupe + variant + notes : OCR → enrich → candidate picker → form → save) |
| Suggestion | `lib/utils/pokedex-suggestion.ts`, `app/api/pokedex/suggest/route.ts` |
| Pokédex | `components/pokedex/PokedexGrid.tsx`, `PokedexCell.tsx`, `PokedexListItem.tsx`, `PokedexDrawer.tsx`, `PokedexFilters.tsx` (3 view modes) |
| Vinted | `app/(app)/vinted/page.tsx`, `app/api/cards/[id]/route.ts`, `components/vinted/{VintedList,VintedFilters,VintedRow,EditablePriceCell,SoldModal,RestockToast,AnnonceModal}.tsx`, `lib/utils/{group-cards,restock-detection,vinted-template}.ts` |

## Pipeline d'enrichissement

1. OCR (Gemini 3 Flash Preview) → JSON structuré `{ card_name, set_code, set_number, language, confidence, pokemon_number, pokemon_name_fr, set_name, set_name_fr }`. Fallback Google Vision si Gemini timeout/erreur/clé absente (sans champs FR).
2. Enrich Strategy 1 : `setCode + setNumber` → lookup direct table `tcg_catalog` (normalisation SM-P/XY-P via `normalizeSetCode`)
3. Enrich Strategy 2 : `total + setNumber` → lookup loose dans `tcg_catalog` (gère JP où denominator imprimé != cardCount officiel) + disambiguation par nom OCR
4. Enrich Strategy 3 : TCGdex live fallback (nouveaux sets pas encore dans le catalogue)
5. Strategy 4 : null (OCR extractions conservées pour pré-remplir le form, user complète à la main)
6. Avant de retourner, `applyGeminiEnrichments` reformate `card_name`, `pokemon_name`, `set_name` en `"FR (Original)"` quand Gemini a fourni une traduction et que la langue n'est pas FR. Propage `pokemon_number` quand le catalogue ne l'a pas.

**Disambiguation par nom** : si le nom du Pokémon dans l'OCR match un seul candidat → auto-select. Sinon → picker visuel.

## Conventions

- Strict TypeScript, ESLint + Prettier, Geist (font Google), theme dark par defaut.
- Pas de `localStorage` — Supabase est la source de verite unique.
- App mono-utilisateur. Auth Supabase email/password minimale.
- Matching multi-langues par `set_code + set_number` (universel JP/EN/FR).

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
